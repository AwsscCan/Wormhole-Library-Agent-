import { queryTopicLibrary } from "@/lib/research/catalogPort";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import type { ResearchSession, SourceTransparentResource, TopicLibraryResult } from "@/lib/research/types";
import { readMemorySummary } from "./ports";
import { selectExplorationCandidates } from "./recommendation";
import type { CandidateBand, ExplorationCandidate, ResourceDifficulty, SurpriseLevel } from "./types";

function difficulty(value: SourceTransparentResource["difficulty"]): ResourceDifficulty {
  if (value === "intro") return "introductory";
  if (value === "research") return "research";
  return "intermediate";
}

export function catalogCandidates(session: ResearchSession, catalog: TopicLibraryResult): ExplorationCandidate[] {
  const knownConcepts = [...new Map(session.searches.flatMap((search) => search.concepts).map((concept) => [concept.id, concept])).values()];
  const count = Math.max(catalog.resources.length, 1);
  return catalog.resources.map((resource, index) => {
    const percentile = index / count;
    const band: CandidateBand = percentile < 0.5 ? "direct" : percentile < 0.8 ? "adjacent" : "distant";
    const targetConcept = resource.concepts[0];
    const originConcept = knownConcepts[0];
    const bridge = band === "direct" ? undefined
      : originConcept && targetConcept
        ? `${originConcept.name} → ${targetConcept.name}, using source-supplied concept labels`
        : `The source ranked this item for “${session.researchQuestion}”`;
    return {
      id: `recommend:${resource.id}`, resourceId: resource.id, title: resource.title, band,
      relevance: Math.max(0.35, 1 - percentile * 0.55), trust: resource.qualityScore,
      accessible: resource.availability === "available" || resource.availability === "online",
      conceptIds: resource.concepts.map((concept) => concept.id),
      citationIds: resource.provenance.externalId ? [resource.provenance.externalId] : [],
      bridge, taskValue: band === "distant" ? resource.why : undefined,
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
  return { sessionId: session.id,
    recommendations: selectExplorationCandidates(catalogCandidates(session, catalog), {
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
    readMemorySummary(ownerId, sessionId),
  ]);
  return buildRecommendationResult(session, catalog, memory, options);
}
