/**
 * Feedback Ranking Tests
 *
 * Tests for:
 * - rankWithMemory: prefEmpirical → empirical papers rank higher
 * - rankWithMemory: low mathTolerance → math-heavy papers rank lower
 * - rankWithMemory: likedDomains → liked domain papers rank higher
 * - rankWithMemory: dislikedDomains → disliked domain papers rank lower
 * - Full feedback loop: feedback → compile → apply → rank → ordering changes
 * - "too_theoretical" feedback → next search shows empirical papers first
 * - No-LLM degradation: ranking is pure deterministic computation
 */

import { describe, it, expect } from "vitest";
import { rankWithMemory } from "../../lib/memory/rankWithMemory";
import { compileFeedback } from "../../lib/memory/compileFeedback";
import { applyPatch } from "../../lib/memory/applyPatch";
import { getDefaultMemory } from "../../lib/memory/getMemory";
import { MemoryCompilerImpl } from "../../lib/memory/index";
import type {
  PaperCard,
  ConceptTag,
  Feedback,
  MemorySnapshot,
} from "../../lib/types";

// ─── Test Data ────────────────────────────────────────────────────

const theoreticalPaper: PaperCard = {
  id: "W_theory",
  title: "A Purely Theoretical Framework for Mathematical Optimization",
  doi: "10.1/theory",
  year: 2020,
  authors: ["Theoretician, A."],
  citedByCount: 100,
  abstract: "We prove that...",
  concepts: [
    { id: "c_math", name: "Mathematics", score: 0.95, level: 0 },
    { id: "c_opt", name: "Optimization", score: 0.85, level: 1 },
    { id: "c_prob", name: "Probability Theory", score: 0.75, level: 1 },
  ],
  openAccess: false, openAccessPdf: null,
};

const empiricalPaper: PaperCard = {
  id: "W_empirical",
  title: "An Empirical Study of Agent Behavior in Real Environments",
  doi: "10.2/empirical",
  year: 2023,
  authors: ["Experimenter, B."],
  citedByCount: 80,
  abstract: "We conducted experiments...",
  concepts: [
    { id: "c_ai", name: "Artificial Intelligence", score: 0.9, level: 0 },
    { id: "c_agent", name: "AI Agent", score: 0.85, level: 1 },
    { id: "c_exp", name: "Experiment", score: 0.7, level: 3 },
  ],
  openAccess: true, openAccessPdf: null,
};

const economicsPaper: PaperCard = {
  id: "W_econ",
  title: "Auction Design in Multi-Agent Systems",
  doi: "10.3/econ",
  year: 2019,
  authors: ["Economist, C."],
  citedByCount: 120,
  abstract: "We design auction mechanisms...",
  concepts: [
    { id: "c_econ", name: "Economics", score: 0.9, level: 0 },
    { id: "c_game", name: "Game Theory", score: 0.85, level: 1 },
    { id: "c_mech", name: "Mechanism Design", score: 0.8, level: 2 },
  ],
  openAccess: true, openAccessPdf: null,
};

const allPapers = [theoreticalPaper, empiricalPaper, economicsPaper];

// ─── Tests ─────────────────────────────────────────────────────────

describe("Feedback Ranking — rankWithMemory", () => {
  it("ranks empirical paper higher when user prefers empirical", () => {
    const memory: MemorySnapshot = {
      ...getDefaultMemory(),
      reading: { ...getDefaultMemory().reading, prefEmpirical: true },
    };
    const ranked = rankWithMemory(allPapers, memory);
    const empiricalRank = ranked.findIndex((p) => p.id === "W_empirical");
    const theoreticalRank = ranked.findIndex((p) => p.id === "W_theory");
    expect(empiricalRank).toBeLessThan(theoreticalRank);
  });

  it("ranks math-heavy paper lower when mathTolerance is low", () => {
    const memory: MemorySnapshot = {
      ...getDefaultMemory(),
      difficulty: { preferredLevel: "undergrad", mathTolerance: 0.3 },
    };
    const ranked = rankWithMemory(allPapers, memory);
    const mathRank = ranked.findIndex((p) => p.id === "W_theory");
    // Math-heavy paper should be ranked last
    expect(mathRank).toBe(ranked.length - 1);
  });

  it("ranks liked domain paper higher", () => {
    const memory: MemorySnapshot = {
      ...getDefaultMemory(),
      serendipity: {
        defaultSlider: 60,
        likedDomains: ["Economics"],
        dislikedDomains: [],
      },
    };
    const ranked = rankWithMemory(allPapers, memory);
    const econRank = ranked.findIndex((p) => p.id === "W_econ");
    // Economics paper should be in top 2
    expect(econRank).toBeLessThan(2);
  });

  it("ranks disliked domain paper lower", () => {
    const memory: MemorySnapshot = {
      ...getDefaultMemory(),
      serendipity: {
        defaultSlider: 60,
        likedDomains: [],
        dislikedDomains: ["Mathematics"],
      },
    };
    const ranked = rankWithMemory(allPapers, memory);
    const mathRank = ranked.findIndex((p) => p.id === "W_theory");
    // Math-heavy paper should be ranked last (it has Mathematics concept)
    expect(mathRank).toBe(ranked.length - 1);
  });

  it("preserves original order when memory has no preferences", () => {
    // Use a neutral memory
    const memory: MemorySnapshot = {
      reading: {},
      difficulty: { mathTolerance: 1.0 },
      citation: {},
      serendipity: { defaultSlider: 50, likedDomains: [], dislikedDomains: [] },
    };
    const ranked = rankWithMemory(allPapers, memory);
    // Without preferences, ranking is by citedByCount
    expect(ranked[0].id).toBe("W_econ"); // 120 citations
    expect(ranked[1].id).toBe("W_theory"); // 100 citations
    expect(ranked[2].id).toBe("W_empirical"); // 80 citations
  });

  it("sets _rankScore on every paper", () => {
    const memory = getDefaultMemory();
    const ranked = rankWithMemory(allPapers, memory);
    for (const paper of ranked) {
      expect(paper._rankScore).toBeDefined();
      expect(typeof paper._rankScore).toBe("number");
    }
  });

  it("does not mutate the original paper array", () => {
    const memory = getDefaultMemory();
    const original = [...allPapers];
    rankWithMemory(allPapers, memory);
    expect(allPapers.map((p) => p.id)).toEqual(original.map((p) => p.id));
  });
});

// ─── Full Feedback Loop Tests ──────────────────────────────────────

describe("Feedback Ranking — Full Loop", () => {
  it('"too_theoretical" feedback changes next search ranking', () => {
    const compiler = new MemoryCompilerImpl();
    let memory = getDefaultMemory();

    // Before feedback: theoretical paper is ranked #2 (by citations)
    const beforeRanking = rankWithMemory(allPapers, memory);
    const beforeTheoryRank = beforeRanking.findIndex((p) => p.id === "W_theory");
    const beforeEmpiricalRank = beforeRanking.findIndex((p) => p.id === "W_empirical");

    // User gives "too theoretical" feedback on the theoretical paper
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W_theory",
      rating: "too_theoretical",
      freeText: "I want more empirical work",
    };
    const patches = compiler.compile(feedback, theoreticalPaper);
    const { memory: updatedMemory } = compiler.apply(memory, patches);
    memory = updatedMemory;

    // After feedback: empirical paper should rank higher
    const afterRanking = rankWithMemory(allPapers, memory);
    const afterTheoryRank = afterRanking.findIndex((p) => p.id === "W_theory");
    const afterEmpiricalRank = afterRanking.findIndex((p) => p.id === "W_empirical");

    // Empirical should be ranked better than before
    expect(afterEmpiricalRank).toBeLessThanOrEqual(beforeEmpiricalRank);
    // Or theoretical should be ranked worse than before
    expect(afterTheoryRank).toBeGreaterThanOrEqual(beforeTheoryRank);
    // At least one of them should have moved
    expect(
      afterEmpiricalRank < beforeEmpiricalRank ||
      afterTheoryRank > beforeTheoryRank
    ).toBe(true);
  });

  it('"too_hard" feedback pushes math-heavy papers down', () => {
    const compiler = new MemoryCompilerImpl();
    let memory = getDefaultMemory();

    // Before: math paper is #2 by citations
    const beforeRanking = rankWithMemory(allPapers, memory);
    const beforeMathRank = beforeRanking.findIndex((p) => p.id === "W_theory");

    // User says "too hard"
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W_theory",
      rating: "too_hard",
      freeText: null,
    };
    const patches = compiler.compile(feedback, theoreticalPaper);
    const { memory: updatedMemory } = compiler.apply(memory, patches);
    memory = updatedMemory;

    // After: math paper should be ranked lower
    const afterRanking = rankWithMemory(allPapers, memory);
    const afterMathRank = afterRanking.findIndex((p) => p.id === "W_theory");
    expect(afterMathRank).toBeGreaterThan(beforeMathRank);
  });

  it('"interesting" feedback pulls liked domain up', () => {
    const compiler = new MemoryCompilerImpl();
    let memory = getDefaultMemory();

    // Before: economics paper is #1 by citations but let's test
    // with a memory that has no liked domains
    const beforeRanking = rankWithMemory(allPapers, memory);
    const beforeEconScore = beforeRanking.find((p) => p.id === "W_econ")?._rankScore;

    // User says "interesting" on economics paper
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W_econ",
      rating: "interesting",
      freeText: "I love the economics perspective",
    };
    const patches = compiler.compile(feedback, economicsPaper);
    const { memory: updatedMemory } = compiler.apply(memory, patches);
    memory = updatedMemory;

    // After: economics paper should have same or higher score
    const afterRanking = rankWithMemory(allPapers, memory);
    const afterEconScore = afterRanking.find((p) => p.id === "W_econ")?._rankScore;
    expect(afterEconScore!).toBeGreaterThanOrEqual(beforeEconScore!);
  });

  it("multiple feedbacks accumulate correctly", () => {
    const compiler = new MemoryCompilerImpl();
    let memory = getDefaultMemory();
    const initialTolerance = memory.difficulty.mathTolerance;

    // Three rounds of "too hard" feedback
    for (let i = 0; i < 3; i++) {
      const feedback: Feedback = {
        targetType: "paper",
        targetId: "W_theory",
        rating: "too_hard",
        freeText: null,
      };
      const patches = compiler.compile(feedback, theoreticalPaper);
      const { memory: updatedMemory } = compiler.apply(memory, patches);
      memory = updatedMemory;
    }

    // mathTolerance should have decreased by ~0.24 (3 × 0.08)
    expect(memory.difficulty.mathTolerance).toBeLessThan(initialTolerance ?? 1);
    expect(memory.difficulty.mathTolerance).toBeLessThan(0.3);
  });

  it("no-LLM degradation: ranking is deterministic across runs", () => {
    const memory = getDefaultMemory();
    const run1 = rankWithMemory(allPapers, memory);
    const run2 = rankWithMemory(allPapers, memory);
    expect(run1.map((p) => p.id)).toEqual(run2.map((p) => p.id));
    expect(run1.map((p) => p._rankScore)).toEqual(run2.map((p) => p._rankScore));
  });
});
