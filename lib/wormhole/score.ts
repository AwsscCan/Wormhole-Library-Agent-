/**
 * Wormhole Scoring Module
 *
 * Implements the scoring formulas from design doc section 10:
 * - 10.2: Novelty (concept set difference)
 * - 10.3: NoveltyFit (slider-adapted)
 * - 10.4: BridgeScore (path strength + explainability)
 * - 10.5: QualityScore (cited by + open access + abstract + difficulty)
 * - 10.6: FinalScore (weighted combination)
 * - 10.7: Memory correction
 *
 * Elimination rules (10.4):
 *   bridge_score < 0.35 → discard
 *   no paper endpoint → discard
 */

import type { PaperCard, ConceptTag, MemorySnapshot } from "../types";
import {
  computeNovelty,
  computeNoveltyFit,
} from "../concepts/vectors";

/**
 * Compute novelty score: fraction of target's concepts not in start's concepts.
 * Design doc 10.2.
 */
export function scoreNovelty(
  startConcepts: ConceptTag[],
  targetConcepts: ConceptTag[]
): number {
  return computeNovelty(startConcepts, targetConcepts);
}

/**
 * Compute novelty_fit: how well the actual novelty matches the slider target.
 * Design doc 10.3.
 */
export function scoreNoveltyFit(
  novelty: number,
  sliderValue: number
): number {
  return computeNoveltyFit(novelty, sliderValue);
}

/**
 * Compute bridge_score from a citation path.
 * Design doc 10.4.
 *
 * path_strength = average(edge.weight for edge in path)
 * path_explainability = 1 - ((path_length - 2)^2 / 4)  // 2 hops optimal
 * bridge_score = 0.65 * path_strength + 0.35 * path_explainability
 */
export function scoreBridge(
  edgeWeights: number[],
  pathLength: number
): number {
  if (edgeWeights.length === 0) return 0;

  const pathStrength =
    edgeWeights.reduce((sum, w) => sum + w, 0) / edgeWeights.length;

  // path_length is the number of hops (papers.length - 1)
  // 2 hops is optimal; longer paths get penalized
  const pathExplainability = Math.max(0, 1 - ((pathLength - 2) ** 2) / 4);

  return 0.65 * pathStrength + 0.35 * pathExplainability;
}

/**
 * Compute quality_score for a target paper.
 * Design doc 10.5.
 *
 * quality_score =
 *   0.45 * normalized_cited_by_count
 *   + 0.25 * (open_access ? 1 : 0.5)
 *   + 0.20 * (has_abstract ? 1 : 0.3)
 *   + 0.10 * difficulty_match
 */
export function scoreQuality(
  paper: PaperCard,
  maxCitedBy: number,
  memory?: MemorySnapshot
): number {
  const normalizedCitedBy =
    maxCitedBy > 0 ? paper.citedByCount / maxCitedBy : 0;

  const openAccessScore = paper.openAccess ? 1 : 0.5;
  const hasAbstractScore = paper.abstract ? 1 : 0.3;

  // Difficulty match: does the paper's concepts match user's tolerance?
  let difficultyMatch = 0.5; // neutral default
  if (memory?.difficulty?.mathTolerance !== undefined) {
    const hasMath = paper.concepts.some(
      (c) =>
        c.name === "Mathematics" ||
        c.name === "Probability Theory" ||
        c.name === "Statistical Physics"
    );
    if (hasMath && memory.difficulty.mathTolerance < 0.4) {
      difficultyMatch = 0.2; // user doesn't want math-heavy
    } else if (!hasMath) {
      difficultyMatch = 0.8; // non-math paper, user-friendly
    }
  }

  return (
    0.45 * normalizedCitedBy +
    0.25 * openAccessScore +
    0.20 * hasAbstractScore +
    0.10 * difficultyMatch
  );
}

/**
 * Compute final_score: weighted combination.
 * Design doc 10.6.
 *
 * final_score =
 *   0.40 * bridge_score
 *   + 0.30 * novelty_fit
 *   + 0.20 * quality_score
 *   + 0.10 * diversity_score
 */
export function scoreFinal(
  bridgeScore: number,
  noveltyFit: number,
  qualityScore: number,
  diversityScore: number = 0.5
): number {
  return (
    0.40 * bridgeScore +
    0.30 * noveltyFit +
    0.20 * qualityScore +
    0.10 * diversityScore
  );
}

/**
 * Apply memory corrections to the final score.
 * Design doc 10.7.
 *
 * if target_domain in memory.likedDomains:     final_score += 0.05
 * if target_domain in memory.dislikedDomains:  final_score -= 0.08
 * if target_needs_high_math and mathTolerance < 0.4:  final_score -= 0.10
 * if memory.languagePref == "zh_first" and paper.is_chinese:  final_score += 0.04
 */
export function applyMemoryCorrection(
  finalScore: number,
  targetPaper: PaperCard,
  memory?: MemorySnapshot
): number {
  if (!memory) return finalScore;

  let corrected = finalScore;

  // Check liked/disliked domains
  const targetDomains = targetPaper.concepts
    .filter((c) => c.level <= 1)
    .map((c) => c.name);

  for (const domain of targetDomains) {
    if (memory.serendipity?.likedDomains?.includes(domain)) {
      corrected += 0.05;
    }
    if (memory.serendipity?.dislikedDomains?.includes(domain)) {
      corrected -= 0.08;
    }
  }

  // Math tolerance check
  const hasHighMath = targetPaper.concepts.some(
    (c) =>
      c.name === "Mathematics" ||
      c.name === "Probability Theory" ||
      c.name === "Statistical Physics"
  );
  if (hasHighMath && (memory.difficulty?.mathTolerance ?? 1) < 0.4) {
    corrected -= 0.10;
  }

  // Language preference (simplified: check if title contains Chinese characters)
  if (memory.reading?.languagePref === "zh_first") {
    const isChinese = /[\u4e00-\u9fff]/.test(targetPaper.title);
    if (isChinese) {
      corrected += 0.04;
    }
  }

  return corrected;
}

/**
 * Compute diversity score: how different is this wormhole from
 * already-selected wormholes?
 *
 * diversity = 1 - max(overlap with any selected wormhole's target concepts)
 */
export function computeDiversity(
  targetConcepts: ConceptTag[],
  selectedTargets: ConceptTag[][]
): number {
  if (selectedTargets.length === 0) return 1;

  let maxOverlap = 0;
  const targetNames = new Set(
    targetConcepts.filter((c) => c.level >= 1).map((c) => c.name)
  );

  for (const selected of selectedTargets) {
    const selectedNames = new Set(
      selected.filter((c) => c.level >= 1).map((c) => c.name)
    );
    const intersection = [...targetNames].filter((n) => selectedNames.has(n));
    const union = new Set([...targetNames, ...selectedNames]);
    const jaccard = union.size > 0 ? intersection.length / union.size : 0;
    maxOverlap = Math.max(maxOverlap, jaccard);
  }

  return Math.max(0, 1 - maxOverlap);
}

/**
 * Check if a candidate should be eliminated.
 * Design doc 10.4: bridge_score < 0.35 → discard, no paper → discard.
 */
export function shouldEliminate(
  bridgeScore: number,
  hasPaper: boolean,
  novelty: number
): { eliminate: boolean; reason: string } {
  if (!hasPaper) {
    return { eliminate: true, reason: "no_paper_endpoint" };
  }
  if (bridgeScore < 0.35) {
    return { eliminate: true, reason: "low_bridge_score" };
  }
  // Extremely high novelty with no bridge is also eliminated
  if (novelty > 0.95 && bridgeScore < 0.40) {
    return { eliminate: true, reason: "random_not_bridged" };
  }
  return { eliminate: false, reason: "pass" };
}
