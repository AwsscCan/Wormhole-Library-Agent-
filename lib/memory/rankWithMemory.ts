/**
 * Rank With Memory Module
 *
 * Implements the MemoryCompiler.rank() interface.
 * Re-ranks search results based on user memory preferences.
 *
 * Design doc 11.4: ranking multipliers
 *   base score = citedByCount
 *   zh_first & isChinese         → ×1.15
 *   mathTolerance < 0.4 & math   → ×0.70
 *   0.4 ≤ mathTolerance < 0.6    → ×0.85 (moderate math aversion)
 *   likedDomains includes       → ×1.10
 *   dislikedDomains includes    → ×0.80
 *   prefEmpirical & empirical   → ×1.12
 *   prefEmpirical & purely theoretical → ×0.85
 *   prefTheoretical & theoretical → ×1.08
 *   theoryTolerance < 0.95 & purely theoretical → ×0.85
 *
 * The theory-side multipliers make the feedback loop observable:
 * "too theoretical" feedback sets prefEmpirical=true and decrements
 * theoryTolerance, which together push theoretical papers down and
 * empirical papers up on the NEXT search — the ranking visibly moves.
 *
 * This is what makes the feedback → memory → ranking loop work:
 * after user says "too theoretical", next search shows empirical first.
 */

import type { PaperCard, MemorySnapshot } from "../types";
import { applyMemoryCorrection } from "../wormhole/score";

/**
 * Check if a paper is "Chinese" (title contains CJK characters).
 */
function isChinesePaper(paper: PaperCard): boolean {
  return /[\u4e00-\u9fff]/.test(paper.title);
}

/**
 * Check if a paper is empirical (has empirical-related concepts).
 */
function isEmpiricalPaper(paper: PaperCard): boolean {
  const empiricalConcepts = [
    "Empirical Research",
    "Experiment",
    "Experimental Study",
    "Field Study",
    "Survey",
    "Case Study",
    "Measurement",
  ];
  return paper.concepts.some((c) =>
    empiricalConcepts.some((e) =>
      c.name.toLowerCase().includes(e.toLowerCase())
    )
  );
}

/**
 * Check if a paper is theoretical (has theory-related concepts).
 */
function isTheoreticalPaper(paper: PaperCard): boolean {
  const theoreticalConcepts = [
    "Theory",
    "Theorem",
    "Proof",
    "Mathematics",
    "Formal Method",
    "Probability Theory",
    "Information Theory",
  ];
  return paper.concepts.some((c) =>
    theoreticalConcepts.some((t) =>
      c.name.toLowerCase().includes(t.toLowerCase())
    )
  );
}

/**
 * Check if a paper is math-heavy.
 */
function isMathHeavy(paper: PaperCard): boolean {
  const mathConcepts = [
    "Mathematics",
    "Probability Theory",
    "Statistical Physics",
    "Optimization",
    "Information Theory",
  ];
  return paper.concepts.some((c) => mathConcepts.includes(c.name));
}

/**
 * Get the domain of a paper's top concept (level <= 1).
 */
function getTopDomain(paper: PaperCard): string {
  const topConcept = paper.concepts.find((c) => c.level <= 1);
  return topConcept?.name ?? "Unknown";
}

/**
 * Re-rank papers based on user memory.
 *
 * @param papers - Search results to re-rank
 * @param memory - User's memory snapshot
 * @returns Re-sorted papers with _rankScore set
 */
export function rankWithMemory(
  papers: PaperCard[],
  memory: MemorySnapshot
): PaperCard[] {
  // Avoid mutating the original array
  const ranked = papers.map((paper) => {
    let score = paper.citedByCount; // base score

    // Language preference
    if (memory.reading?.languagePref === "zh_first" && isChinesePaper(paper)) {
      score *= 1.15;
    }

    // Math tolerance — tiered:
    //   < 0.4  → strong penalty (user explicitly dislikes math)
    //   < 0.6  → moderate penalty (user leans away from math)
    const mathTolerance = memory.difficulty?.mathTolerance ?? 1.0;
    if (isMathHeavy(paper)) {
      if (mathTolerance < 0.4) {
        score *= 0.70;
      } else if (mathTolerance < 0.6) {
        score *= 0.85;
      }
    }

    // Empirical/theoretical preference
    const empirical = isEmpiricalPaper(paper);
    const theoretical = isTheoreticalPaper(paper);
    if (memory.reading?.prefEmpirical && empirical) {
      score *= 1.12;
    }
    // Preferring empirical means purely-theoretical work gets pushed down
    if (
      memory.reading?.prefEmpirical &&
      theoretical &&
      !empirical
    ) {
      score *= 0.85;
    }
    if (memory.reading?.prefTheoretical && theoretical) {
      score *= 1.08;
    }
    // Low theory tolerance (set by "too theoretical" feedback) pushes
    // purely-theoretical papers further down
    if (
      (memory.difficulty?.theoryTolerance ?? 1) < 0.95 &&
      theoretical &&
      !empirical
    ) {
      score *= 0.85;
    }

    // Liked domains
    const paperDomain = getTopDomain(paper);
    if (memory.serendipity?.likedDomains?.includes(paperDomain)) {
      score *= 1.10;
    }

    // Disliked domains
    if (memory.serendipity?.dislikedDomains?.includes(paperDomain)) {
      score *= 0.80;
    }

    // Difficulty level preference
    const prefLevel = memory.difficulty?.preferredLevel;
    if (prefLevel === "beginner" && paper.citedByCount > 1000) {
      // Very highly cited papers might be surveys/textbooks — good for beginners
      score *= 1.05;
    }
    if (prefLevel === "research" && paper.citedByCount < 10) {
      // For researchers, very new/low-cited papers might be cutting-edge
      score *= 1.03;
    }

    return { ...paper, _rankScore: Math.round(score * 100) / 100 };
  });

  // Sort by rank score descending
  ranked.sort((a, b) => (b._rankScore ?? 0) - (a._rankScore ?? 0));

  return ranked;
}

/* ---------------- 责任书 3.4 公开入口 ---------------- */


/**
 * 责任书 3.4 公开入口：把记忆修正应用到单个候选的排序分数上
 * （签名 applyMemoryToRanking(score, candidate, memory): number）。
 * 规则即设计文档 10.7：likedDomain +0.05 / dislikedDomain -0.08 /
 * 高数学要求且 mathTolerance < 0.4 时 -0.10 / 中文优先且资源为中文 +0.04。
 */
export function applyMemoryToRanking(
  score: number,
  candidate: PaperCard,
  memory?: MemorySnapshot
): number {
  return applyMemoryCorrection(score, candidate, memory);
}
