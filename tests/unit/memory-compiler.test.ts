/**
 * Memory Compiler Tests
 *
 * Tests for:
 * - compileFeedback: "too_hard" → mathTolerance decreases
 * - compileFeedback: "interesting" → likedDomains added
 * - compileFeedback: "too_theoretical" → prefEmpirical set
 * - compileFeedback: "too_empirical" → prefTheoretical set
 * - compileFeedback: "just_right" → confidence incremented
 * - applyPatch: patches correctly update memory snapshot
 * - applyPatch: mathTolerance clamped to [0, 1]
 * - getContext: renders human-readable context
 * - no-LLM degradation: all operations are deterministic
 */

import { describe, it, expect } from "vitest";
import { compileFeedback } from "../../lib/memory/compileFeedback";
import { applyPatch } from "../../lib/memory/applyPatch";
import { renderMemoryContext, renderMemoryUsed } from "../../lib/memory/renderMemoryContext";
import { getDefaultMemory } from "../../lib/memory/getMemory";
import { MemoryCompilerImpl } from "../../lib/memory/index";
import type { Feedback, PaperCard, ConceptTag, MemorySnapshot } from "../../lib/types";

// ─── Test Data ────────────────────────────────────────────────────

const aiPaper: PaperCard = {
  id: "W100",
  title: "AI Agent Planning",
  doi: "10.1/test",
  year: 2024,
  authors: ["Smith"],
  citedByCount: 50,
  abstract: "Planning for AI agents...",
  concepts: [
    { id: "c_ai", name: "Artificial Intelligence", score: 0.95, level: 0 },
    { id: "c_agent", name: "AI Agent", score: 0.9, level: 1 },
    { id: "c_math", name: "Mathematics", score: 0.7, level: 1 },
  ],
  openAccess: true, openAccessPdf: null,
};

const econPaper: PaperCard = {
  id: "W200",
  title: "Mechanism Design in Multi-Agent Systems",
  doi: "10.2/test",
  year: 2020,
  authors: ["Jones"],
  citedByCount: 200,
  abstract: "We study mechanism design...",
  concepts: [
    { id: "c_econ", name: "Economics", score: 0.9, level: 0 },
    { id: "c_game", name: "Game Theory", score: 0.85, level: 1 },
    { id: "c_mech", name: "Mechanism Design", score: 0.8, level: 2 },
  ],
  openAccess: true, openAccessPdf: null,
};

// ─── Tests ─────────────────────────────────────────────────────────

describe("Memory Compiler — compileFeedback", () => {
  it('"too_hard" feedback decreases mathTolerance', () => {
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W100",
      rating: "too_hard",
      freeText: null,
    };
    const patches = compileFeedback(feedback, aiPaper);

    const mathPatch = patches.find((p) => p.key === "difficulty.mathTolerance");
    expect(mathPatch).toBeDefined();
    expect(mathPatch!.operation).toBe("decrement");
    expect(mathPatch!.value).toBe(0.08);
  });

  it('"too_hard" feedback adds Mathematics to dislikedDomains when paper is math-heavy', () => {
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W100",
      rating: "too_hard",
      freeText: null,
    };
    const patches = compileFeedback(feedback, aiPaper);

    const dislikePatch = patches.find(
      (p) => p.key === "serendipity.dislikedDomains"
    );
    expect(dislikePatch).toBeDefined();
    expect(dislikePatch!.value).toBe("Mathematics");
  });

  it('"interesting" feedback adds paper domain to likedDomains', () => {
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W200",
      rating: "interesting",
      freeText: null,
    };
    const patches = compileFeedback(feedback, econPaper);

    const likePatch = patches.find(
      (p) => p.key === "serendipity.likedDomains"
    );
    expect(likePatch).toBeDefined();
    // Game Theory maps to Economics in DOMAIN_MAP
    expect(likePatch!.value).toBe("Economics");
  });

  it('"interesting" feedback extracts domains from freeText', () => {
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W200",
      rating: "interesting",
      freeText: "I love the economics angle and the game theory",
    };
    const patches = compileFeedback(feedback, econPaper);

    const likePatches = patches.filter(
      (p) => p.key === "serendipity.likedDomains"
    );
    expect(likePatches.length).toBeGreaterThan(0);
    // Should include "Economics" from both concepts and text
    const values = likePatches.map((p) => p.value);
    expect(values).toContain("Economics");
  });

  it('"interesting" feedback sets default slider to 70', () => {
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W200",
      rating: "interesting",
      freeText: null,
    };
    const patches = compileFeedback(feedback, econPaper);

    const sliderPatch = patches.find(
      (p) => p.key === "serendipity.defaultSlider"
    );
    expect(sliderPatch).toBeDefined();
    expect(sliderPatch!.value).toBe(70);
  });

  it('"too_theoretical" feedback sets prefEmpirical=true', () => {
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W100",
      rating: "too_theoretical",
      freeText: null,
    };
    const patches = compileFeedback(feedback, aiPaper);

    const empiricalPatch = patches.find(
      (p) => p.key === "reading.prefEmpirical"
    );
    expect(empiricalPatch).toBeDefined();
    expect(empiricalPatch!.value).toBe(true);

    const tolerancePatch = patches.find(
      (p) => p.key === "difficulty.theoryTolerance"
    );
    expect(tolerancePatch).toBeDefined();
    expect(tolerancePatch!.operation).toBe("decrement");
  });

  it('"too_empirical" feedback sets prefTheoretical=true', () => {
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W100",
      rating: "too_empirical",
      freeText: null,
    };
    const patches = compileFeedback(feedback, aiPaper);

    const theoryPatch = patches.find(
      (p) => p.key === "reading.prefTheoretical"
    );
    expect(theoryPatch).toBeDefined();
    expect(theoryPatch!.value).toBe(true);
  });

  it('"just_right" feedback produces minimal patches', () => {
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W100",
      rating: "just_right",
      freeText: null,
    };
    const patches = compileFeedback(feedback, aiPaper);
    // Should produce at least one patch (confidence increment)
    expect(patches.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts citation style from freeText", () => {
    const feedback: Feedback = {
      targetType: "citation",
      targetId: "W100",
      rating: "just_right",
      freeText: "Please use APA format from now on",
    };
    const patches = compileFeedback(feedback, aiPaper);
    const stylePatch = patches.find(
      (p) => p.key === "citation.defaultStyle"
    );
    expect(stylePatch).toBeDefined();
    expect(stylePatch!.value).toBe("apa");
  });
});

// ─── applyPatch Tests ──────────────────────────────────────────────

describe("Memory Compiler — applyPatch", () => {
  it("applies set patch correctly", () => {
    const memory = getDefaultMemory();
    const patches = [
      { key: "reading.prefEmpirical", operation: "set" as const, value: true, confidenceDelta: 0.1 },
    ];
    const { memory: updated } = applyPatch(memory, patches);
    expect(updated.reading.prefEmpirical).toBe(true);
  });

  it("applies decrement patch to mathTolerance", () => {
    const memory = getDefaultMemory();
    const original = memory.difficulty.mathTolerance;
    const patches = [
      { key: "difficulty.mathTolerance", operation: "decrement" as const, value: 0.08, confidenceDelta: 0.1 },
    ];
    const { memory: updated } = applyPatch(memory, patches);
    expect(updated.difficulty.mathTolerance).toBeCloseTo(
      (original ?? 0.5) - 0.08,
      2
    );
  });

  it("clamps mathTolerance to [0, 1]", () => {
    const memory: MemorySnapshot = {
      ...getDefaultMemory(),
      difficulty: { preferredLevel: "undergrad", mathTolerance: 0.05 },
    };
    const patches = [
      { key: "difficulty.mathTolerance", operation: "decrement" as const, value: 0.5, confidenceDelta: 0.1 },
    ];
    const { memory: updated } = applyPatch(memory, patches);
    expect(updated.difficulty.mathTolerance).toBeGreaterThanOrEqual(0);
  });

  it("applies add_or_increment to likedDomains", () => {
    const memory = getDefaultMemory();
    const patches = [
      { key: "serendipity.likedDomains", operation: "add_or_increment" as const, value: "Economics", confidenceDelta: 0.08 },
    ];
    const { memory: updated } = applyPatch(memory, patches);
    expect(updated.serendipity.likedDomains).toContain("Economics");
  });

  it("does not duplicate likedDomains", () => {
    const memory: MemorySnapshot = {
      ...getDefaultMemory(),
      serendipity: { defaultSlider: 60, likedDomains: ["Economics"], dislikedDomains: [] },
    };
    const patches = [
      { key: "serendipity.likedDomains", operation: "add_or_increment" as const, value: "Economics", confidenceDelta: 0.08 },
    ];
    const { memory: updated } = applyPatch(memory, patches);
    expect(updated.serendipity.likedDomains.filter((d) => d === "Economics").length).toBe(1);
  });

  it("creates a history entry with patches", () => {
    const memory = getDefaultMemory();
    const patches = [
      { key: "difficulty.mathTolerance", operation: "decrement" as const, value: 0.08, confidenceDelta: 0.1 },
    ];
    const { history } = applyPatch(memory, patches);
    expect(history.action).toBe("feedback");
    expect(history.patches).toEqual(patches);
    expect(history.detail).toContain("mathTolerance");
  });

  it("does not mutate the original memory snapshot", () => {
    const memory = getDefaultMemory();
    const originalTolerance = memory.difficulty.mathTolerance;
    const patches = [
      { key: "difficulty.mathTolerance", operation: "decrement" as const, value: 0.2, confidenceDelta: 0.1 },
    ];
    applyPatch(memory, patches);
    expect(memory.difficulty.mathTolerance).toBe(originalTolerance);
  });
});

// ─── renderMemoryContext Tests ────────────────────────────────────

describe("Memory Compiler — renderMemoryContext", () => {
  it("renders a human-readable context string", () => {
    const memory = getDefaultMemory();
    const context = renderMemoryContext(memory, "AI Agent papers");
    expect(context).toContain("User preferences");
    expect(context.length).toBeGreaterThan(20);
  });

  it("includes liked domains in context", () => {
    const memory: MemorySnapshot = {
      ...getDefaultMemory(),
      serendipity: {
        defaultSlider: 60,
        likedDomains: ["Cognitive Science", "Economics"],
        dislikedDomains: [],
      },
    };
    const context = renderMemoryContext(memory, "test");
    expect(context).toContain("Cognitive Science");
    expect(context).toContain("Economics");
  });

  it("includes math tolerance in context", () => {
    const memory: MemorySnapshot = {
      ...getDefaultMemory(),
      difficulty: { preferredLevel: "undergrad", mathTolerance: 0.38 },
    };
    const context = renderMemoryContext(memory, "test");
    expect(context).toContain("0.38");
  });

  it("stays within 1200 character budget", () => {
    const memory: MemorySnapshot = {
      reading: { prefEmpirical: true, summaryFirst: true, languagePref: "zh_first", resultCount: 5 },
      difficulty: { mathTolerance: 0.42, theoryTolerance: 0.5, preferredLevel: "undergrad" },
      citation: { defaultStyle: "apa" },
      serendipity: {
        defaultSlider: 60,
        likedDomains: ["AI", "ML", "NLP", "Physics", "Economics", "Psychology", "Biology"],
        dislikedDomains: ["Pure Math", "Chemistry"],
      },
    };
    const context = renderMemoryContext(memory, "test");
    expect(context.length).toBeLessThanOrEqual(1200);
  });
});

// ─── MemoryCompilerImpl Integration Tests ──────────────────────────

describe("Memory Compiler — Integration (MemoryCompilerImpl)", () => {
  it("full loop: feedback → compile → apply → getContext (no LLM)", () => {
    const compiler = new MemoryCompilerImpl();
    let memory = getDefaultMemory();

    // User says "too hard" on a math-heavy paper
    const feedback: Feedback = {
      targetType: "paper",
      targetId: "W100",
      rating: "too_hard",
      freeText: null,
    };
    const patches = compiler.compile(feedback, aiPaper);
    expect(patches.length).toBeGreaterThan(0);

    const { memory: updatedMemory, history } = compiler.apply(memory, patches);
    memory = updatedMemory;

    // mathTolerance should have decreased
    expect(memory.difficulty.mathTolerance).toBeLessThan(0.5);

    // getContext should work without LLM
    const context = compiler.getContext(memory, "AI Agent papers");
    expect(context).toContain("Math tolerance");

    // Run again — should be deterministic
    const patches2 = compiler.compile(feedback, aiPaper);
    const { memory: memory2 } = compiler.apply(memory, patches2);
    expect(memory2.difficulty.mathTolerance).toBeLessThan(memory.difficulty.mathTolerance);
  });
});
