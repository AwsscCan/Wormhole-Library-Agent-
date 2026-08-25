import { queryTopicLibrary } from "@/lib/research/catalogPort";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import type { ResearchSession, SourceTransparentResource, TopicLibraryResult } from "@/lib/research/types";
import type { MemorySummaryResult } from "./ports";
import { readMemorySummary } from "./ports";
import { selectExplorationCandidates } from "./recommendation";
import { getWorkbenchService } from "./store";
import type { BridgeEvidence, ExplorationCandidate, ResourceDifficulty, SurpriseLevel, WorkbenchResourceProjection } from "./types";

function difficulty(value: SourceTransparentResource["difficulty"]): ResourceDifficulty {
  if (value === "intro") return "introductory";
  if (value === "research") return "research";
  return "intermediate";
}

const tokens = (value: string) => new Set(value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1));
const intersects = (left: Set<string>, right: Set<string>) => [...left].some((value) => right.has(value));

export function catalogCandidates(session: ResearchSession, catalog: TopicLibraryResult, memory: MemorySummaryResult): ExplorationCandidate[] {
  const confirmedResources = session.searches.flatMap((search) => search.resources).filter((resource) => session.evidenceIds.includes(resource.id));
  const personalConceptNodes = Object.keys(session.personalGraph.nodeOverrides)
    .filter((id) => id.startsWith("concept:"))
    .map((nodeId) => ({ nodeId, conceptId: decodeURIComponent(nodeId.slice(8)) }));
  return catalog.resources.map((resource) => {
    const resourceConceptIds = new Set(resource.concepts.map((concept) => concept.id));
    const matchedEvidenceIds = session.evidenceIds.filter((evidenceId) => evidenceId === resource.id
      || confirmedResources.some((item) => item.id === evidenceId && item.concepts.some((concept) => resourceConceptIds.has(concept.id))));
    const evidenceResource = confirmedResources.find((item) => matchedEvidenceIds.includes(item.id));
    const sharedEvidence = evidenceResource?.concepts.find((concept) => resourceConceptIds.has(concept.id))?.id;
    const searchMatch = session.searches.find((search) => search.concepts.some((concept) => resourceConceptIds.has(concept.id)));
    const personalMatch = personalConceptNodes.find((item) => resourceConceptIds.has(item.conceptId));
    const wormholeMatch = session.wormholes.find((wormhole) => wormhole.conceptIds.some((conceptId) => resourceConceptIds.has(conceptId)));
    const sharedContext = searchMatch?.concepts.find((concept) => resourceConceptIds.has(concept.id))?.id ?? personalMatch?.conceptId;
    const sharedWormhole = wormholeMatch?.conceptIds.find((conceptId) => resourceConceptIds.has(conceptId));
    const direct = matchedEvidenceIds.length > 0;
    const band = direct ? "direct" as const : sharedContext ? "adjacent" as const : "distant" as const;
    const bridgeConcept = sharedEvidence ?? sharedContext ?? sharedWormhole;
    const bridgeSourceId = direct ? evidenceResource?.id ?? resource.id
      : sharedContext ? searchMatch?.interactionId ?? personalMatch?.nodeId
        : wormholeMatch?.id;
    const bridgeEvidence: BridgeEvidence | undefined = bridgeConcept && bridgeSourceId ? {
      kind: "shared_concept", sourceId: bridgeSourceId, targetId: resource.id,
      label: `${direct ? "Confirmed evidence" : sharedContext ? "Current session" : "Session wormhole"} shares source-supplied concept ${resource.concepts.find((concept) => concept.id === bridgeConcept)?.name ?? bridgeConcept}`,
    } : undefined;
    const candidateText = tokens([resource.title, resource.why, ...resource.concepts.map((concept) => concept.name)].join(" "));
    const matchedSnippets = memory.snippets.filter((snippet) => intersects(candidateText, tokens(snippet.text)));
    const matchedPreferences = memory.preferences.filter((preference) => intersects(candidateText, tokens(`${preference.key} ${JSON.stringify(preference.value)}`)));
    const evidenceBoost = direct ? 0.18 : sharedContext ? 0.08 : sharedWormhole ? 0.04 : 0;
    const memoryBoost = Math.min(0.16, matchedSnippets.length * 0.08 + matchedPreferences.length * 0.04);
    const relevance = Math.min(0.95, 0.3 + resource.qualityScore * 0.35);
    const effectiveRelevance = Math.min(1, relevance + evidenceBoost + memoryBoost);
    return {
      id: `recommend:${resource.id}`, resourceId: resource.id, title: resource.title, band,
      relevance, effectiveRelevance, evidenceBoost, memoryBoost, trust: resource.qualityScore,
      accessible: resource.availability === "available" || resource.availability === "online",
      conceptIds: resource.concepts.map((concept) => concept.id),
      conceptLabels: resource.concepts.map((concept) => concept.name),
      citationIds: resource.provenance.externalId ? [resource.provenance.externalId] : [],
      bridge: bridgeEvidence?.label, bridgeEvidence, taskValue: band === "distant" ? resource.why : undefined,
      taskValueEvidence: band === "distant" ? { sourceId: resource.provenance.externalId ?? resource.id, label: resource.why } : undefined,
      decisionTrace: { sessionEvidenceIds: matchedEvidenceIds,
        sessionContextIds: [...new Set([searchMatch?.interactionId, wormholeMatch?.id].filter((id): id is string => Boolean(id)))],
        personalGraphNodeIds: personalMatch ? [personalMatch.nodeId] : [],
        memorySnippetIds: matchedSnippets.map((snippet) => snippet.id), preferenceIds: matchedPreferences.map((preference) => preference.id) },
      explanationContext: [...matchedSnippets.map((snippet) => snippet.sourceId), ...matchedPreferences.map((preference) => preference.id)].join(", "),
      sourceUrl: resource.sourceUrl,
      difficulty: difficulty(resource.difficulty), estimatedMinutes: resource.difficulty === "research" ? 35 : resource.difficulty === "intro" ? 15 : 25,
      provenance: resource.provenance,
    };
  });
}

export function buildRecommendationResult(
  session: ResearchSession,
  catalog: TopicLibraryResult,
  memory: Awaited<ReturnType<typeof readMemorySummary>>,
  options: { surpriseLevel: SurpriseLevel; limit: number },
) {
  const candidates = catalogCandidates(session, catalog, memory);
  return { sessionId: session.id, candidates,
    recommendations: selectExplorationCandidates(candidates, {
      surpriseLevel: options.surpriseLevel, limit: options.limit,
    }),
    memory,
    source: { status: catalog.sourceStatus, degraded: catalog.degraded, message: catalog.message,
      labels: [...new Set(catalog.resources.map((resource) => resource.provenance.sourceLabel))] },
  };
}

export async function recommendForSession(ownerId: string, sessionId: string, options: { surpriseLevel: SurpriseLevel; limit: number }) {
  const session = await getResearchSessionService().get(ownerId, sessionId);
  const [catalog, memory] = await Promise.all([
    queryTopicLibrary({ query: session.researchQuestion, limit: Math.max(options.limit * 3, 30) }),
    readMemorySummary(ownerId, sessionId, session.researchQuestion),
  ]);
  const result = buildRecommendationResult(session, catalog, memory, options);
  const resources = new Map(catalog.resources.map((resource) => [resource.id, resource]));
  const projectedAt = new Date().toISOString();
  const projections: WorkbenchResourceProjection[] = result.recommendations.map((recommendation) => {
    const resource = resources.get(recommendation.resourceId)!;
    return { resourceId: resource.id, recommendationId: recommendation.id, title: resource.title,
      conceptIds: resource.concepts.map((concept) => concept.id), conceptLabels: resource.concepts.map((concept) => concept.name),
      sourceLabel: resource.provenance.sourceLabel, sourceUrl: resource.sourceUrl, provenance: resource.provenance, projectedAt };
  });
  const workbench = await getWorkbenchService().projectResources(ownerId, sessionId, projections);
  return { ...result, workbenchVersion: workbench.version, resourceProjections: workbench.resourceProjections };
}
