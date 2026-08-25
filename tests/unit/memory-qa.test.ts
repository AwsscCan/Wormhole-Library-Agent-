import { beforeEach, describe, expect, it } from "vitest";
import {
  addMemorySnippet,
  answerFromSelectedMaterial,
  makeReviewCards,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
} from "@/lib/research/memory";

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
});

function seedSelected() {
  return [
    addMemorySnippet({
      ownerId: "member:alice",
      sessionId: "s1",
      kind: "note",
      sourceId: "ev-1",
      conceptId: "game-theory",
      text: "Mechanism design studies how to design rules of a game so that selfish behaviour leads to good outcomes.",
    }),
    addMemorySnippet({
      ownerId: "member:alice",
      sessionId: "s1",
      kind: "excerpt",
      sourceId: "ev-2",
      conceptId: "multi-agent",
      text: "Multi-agent coordination requires communication protocols and shared world models.",
    }),
  ];
}

describe("package 04 grounded profile Q&A", () => {
  it("answers from selected material with citations", () => {
    const [, excerpt] = seedSelected();
    const answer = answerFromSelectedMaterial({
      ownerId: "member:alice",
      question: "what do multi-agent systems require",
      selectedSourceIds: [excerpt.id],
    });
    expect(answer.status).toBe("supported");
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.citations[0].sourceId).toBe(excerpt.id);
    expect(answer.answer).toContain("Multi-agent coordination");
  });

  it("explicitly refuses to answer when selected material has no support", () => {
    const [note] = seedSelected();
    const answer = answerFromSelectedMaterial({
      ownerId: "member:alice",
      question: "quantum computing error correction thresholds",
      selectedSourceIds: [note.id],
    });
    expect(answer.status).toBe("unknown");
    expect(answer.citations).toHaveLength(0);
    expect(answer.answer).not.toContain("quantum");
  });

  it("refuses when the selection is empty or belongs to someone else", () => {
    seedSelected();
    const empty = answerFromSelectedMaterial({
      ownerId: "member:alice",
      question: "mechanism design",
      selectedSourceIds: [],
    });
    expect(empty.status).toBe("unknown");

    // bob cannot use alice's snippet ids as his own material.
    const [, excerpt] = seedSelected();
    const crossOwner = answerFromSelectedMaterial({
      ownerId: "member:bob",
      question: "multi-agent coordination",
      selectedSourceIds: [excerpt.id],
    });
    expect(crossOwner.status).toBe("unknown");
  });

  it("memory snippets are never treated as external facts: unknown stays unknown", () => {
    const [note] = seedSelected();
    const answer = answerFromSelectedMaterial({
      ownerId: "member:alice",
      question: "how many citations does this paper have on openalex",
      selectedSourceIds: [note.id],
    });
    expect(answer.status).toBe("unknown");
  });

  it("builds review cards only from user-selected snippets", () => {
    const [note, excerpt] = seedSelected();
    const cards = makeReviewCards({ ownerId: "member:alice", selectedSourceIds: [note.id, excerpt.id, "missing-id"] });
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.sourceId)).toEqual([note.id, excerpt.id]);
    expect(cards[0].prompt).toContain("game-theory");
    expect(cards[0].expected.length).toBeGreaterThan(0);
  });
});
