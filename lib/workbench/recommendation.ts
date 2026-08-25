import type {
  CandidateBand,
  ExplorationCandidate,
  ExplorationRecommendation,
  RecommendationExplanation,
  SurpriseLevel,
} from "./types";

const QUOTAS: Record<SurpriseLevel, Record<CandidateBand, number>> = {
  low: { direct: 0.8, adjacent: 0.2, distant: 0 },
  medium: { direct: 0.6, adjacent: 0.3, distant: 0.1 },
  high: { direct: 0.4, adjacent: 0.35, distant: 0.25 },
};
const BAND_ORDER: CandidateBand[] = ["direct", "adjacent", "distant"];

export function filterEligibleCandidates(candidates: ExplorationCandidate[]) {
  return candidates.filter((candidate) => {
    if (!candidate.accessible || (candidate.effectiveRelevance ?? candidate.relevance) < 0.35 || candidate.trust < 0.5) return false;
    if (candidate.band === "adjacent" && !candidate.bridgeEvidence) return false;
    if (candidate.band === "distant" && (!candidate.bridgeEvidence || !candidate.taskValue?.trim() || !candidate.taskValueEvidence)) return false;
    return true;
  });
}

function jaccard(left: string[], right: string[]) {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function noveltyPenalty(candidate: ExplorationCandidate, selected: ExplorationCandidate[]) {
  return selected.length ? Math.max(...selected.map((item) => jaccard(candidate.conceptIds, item.conceptIds))) : 0;
}

function quotaCounts(level: SurpriseLevel, limit: number) {
  const exact = BAND_ORDER.map((band) => ({ band, exact: QUOTAS[level][band] * limit }));
  const counts = Object.fromEntries(exact.map(({ band, exact: value }) => [band, Math.floor(value)])) as Record<CandidateBand, number>;
  let remaining = limit - Object.values(counts).reduce((sum, count) => sum + count, 0);
  for (const item of exact.sort((a, b) => (b.exact % 1) - (a.exact % 1) || BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band))) {
    if (!remaining) break;
    counts[item.band] += 1;
    remaining -= 1;
  }
  return counts;
}

export function explainCandidate(candidate: ExplorationCandidate): RecommendationExplanation {
  const trace = candidate.decisionTrace;
  const evidenceTrace = trace?.sessionEvidenceIds.length ? ` Confirmed evidence: ${trace.sessionEvidenceIds.join(", ")}.` : " No confirmed evidence boost.";
  const contextTraceIds = [...(trace?.sessionContextIds ?? []), ...(trace?.personalGraphNodeIds ?? [])];
  const contextTrace = contextTraceIds.length ? ` Session context: ${contextTraceIds.join(", ")}.` : "";
  const memoryTraceIds = [...(trace?.memorySnippetIds ?? []), ...(trace?.preferenceIds ?? [])];
  const memoryTrace = memoryTraceIds.length ? ` Memory features: ${memoryTraceIds.join(", ")}.` : " No memory feature boost.";
  const relationship = candidate.band === "direct"
    ? `Directly addresses the current research question with traced relevance ${(candidate.effectiveRelevance ?? candidate.relevance).toFixed(2)}.${evidenceTrace}${contextTrace}${memoryTrace}`
    : `Provides a ${candidate.band} perspective with traced relevance ${(candidate.effectiveRelevance ?? candidate.relevance).toFixed(2)}.${evidenceTrace}${contextTrace}${memoryTrace}`;
  const bridge = candidate.bridgeEvidence
    ? `Bridge (${candidate.bridgeEvidence.kind}): ${candidate.bridgeEvidence.label}.`
    : "Bridge: shares the central concepts already present in this research session.";
  const difficulty = `Difficulty is ${candidate.difficulty}; allow about ${candidate.estimatedMinutes} minutes for a first pass.`;
  const newValue = candidate.taskValue?.trim()
    ? `New value: ${candidate.taskValue.trim()} (source: ${candidate.taskValueEvidence?.sourceId ?? candidate.provenance.sourceLabel}).`
    : `New value: adds ${candidate.conceptIds.length || 1} traceable concept connection(s) from ${candidate.provenance.sourceLabel}.`;
  return { relationship, bridge, difficulty, newValue };
}

export function selectExplorationCandidates(
  candidates: ExplorationCandidate[],
  options: { surpriseLevel: SurpriseLevel; limit?: number; lambda?: number },
): ExplorationRecommendation[] {
  const limit = options.limit ?? 20;
  const lambda = options.lambda ?? 0.72;
  const counts = quotaCounts(options.surpriseLevel, limit);
  const eligible = filterEligibleCandidates(candidates);
  const selected: ExplorationRecommendation[] = [];

  for (const band of BAND_ORDER) {
    const pool = eligible.filter((candidate) => candidate.band === band).sort((a, b) => a.id.localeCompare(b.id));
    while (pool.length && selected.filter((item) => item.band === band).length < counts[band]) {
      const scored = pool.map((candidate) => ({
        candidate,
        score: lambda * (candidate.effectiveRelevance ?? candidate.relevance) - (1 - lambda) * noveltyPenalty(candidate, selected),
      })).sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
      const choice = scored[0];
      selected.push({ ...choice.candidate, explanation: explainCandidate(choice.candidate), mmrScore: choice.score });
      pool.splice(pool.findIndex((candidate) => candidate.id === choice.candidate.id), 1);
    }
  }
  return selected;
}

export const surpriseQuotas = QUOTAS;
