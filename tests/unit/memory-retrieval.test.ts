import { beforeEach, describe, expect, it } from "vitest";
import {
  addMemorySnippet,
  deleteMemorySnippet,
  forgetSession,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  searchPrivateMemory,
} from "@/lib/research/memory";

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
});

function seed() {
  addMemorySnippet({
    ownerId: "member:alice",
    sessionId: "s1",
    kind: "note",
    sourceId: "ev-1",
    conceptId: "game-theory",
    text: "Mechanism design studies how to design rules of a game so that selfish behaviour leads to good outcomes.",
  });
  addMemorySnippet({
    ownerId: "member:alice",
    sessionId: "s2",
    kind: "excerpt",
    sourceId: "ev-2",
    conceptId: "multi-agent",
    text: "Multi-agent coordination requires communication protocols and shared world models.",
  });
}

describe("package 04 private retrieval", () => {
  it("never returns another owner's snippets", () => {
    seed();
    addMemorySnippet({
      ownerId: "member:bob",
      sessionId: "t1",
      kind: "note",
      sourceId: "ev-b",
      text: "Mechanism design notes from bob",
    });
    const hits = searchPrivateMemory({ ownerId: "member:alice", query: "mechanism design", limit: 10 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.ownerId === "member:alice")).toBe(true);
  });

  it("session-scoped search only sees that session", () => {
    seed();
    const hits = searchPrivateMemory({ ownerId: "member:alice", sessionId: "s2", query: "coordination", limit: 10 });
    expect(hits).toHaveLength(1);
    expect(hits[0].sessionId).toBe("s2");
  });

  it("deleted snippets can never be recalled again", () => {
    seed();
    const before = searchPrivateMemory({ ownerId: "member:alice", query: "multi-agent coordination", limit: 10 });
    expect(before.length).toBeGreaterThan(0);
    expect(deleteMemorySnippet("member:alice", before[0].id)).toBe(true);
    const after = searchPrivateMemory({ ownerId: "member:alice", query: "multi-agent coordination", limit: 10 });
    expect(after.find((hit) => hit.id === before[0].id)).toBeUndefined();
  });

  it("delete is owner-guarded: bob cannot delete alice's snippet", () => {
    seed();
    const [hit] = searchPrivateMemory({ ownerId: "member:alice", query: "mechanism", limit: 1 });
    expect(deleteMemorySnippet("member:bob", hit.id)).toBe(false);
    expect(searchPrivateMemory({ ownerId: "member:alice", query: "mechanism", limit: 1 }).length).toBeGreaterThan(0);
  });

  it("forgetting a session drops all of its snippets from retrieval", () => {
    seed();
    expect(forgetSession("member:alice", "s1")).toBe(1);
    expect(searchPrivateMemory({ ownerId: "member:alice", query: "mechanism design rules", limit: 10 })).toHaveLength(0);
    expect(searchPrivateMemory({ ownerId: "member:alice", query: "coordination", limit: 10 }).length).toBeGreaterThan(0);
  });

  it("reformulated research questions still recall the note with source and time kept", () => {
    addMemorySnippet({
      ownerId: "member:alice",
      sessionId: "s1",
      kind: "note",
      sourceId: "ev-1",
      text: "Selfish agents need incentive compatible rules to reach good outcomes.",
      createdAt: "2026-08-20T10:00:00.000Z",
    });
    const reformulated = searchPrivateMemory({ ownerId: "member:alice", query: "what rules give selfish agents right incentives", limit: 5 });
    expect(reformulated.length).toBeGreaterThan(0);
    expect(reformulated[0].sourceId).toBe("ev-1");
    expect(reformulated[0].createdAt).toBe("2026-08-20T10:00:00.000Z");
  });

  it("hybrid retrieval ranks the strongly matching note first, marked as both", () => {
    addMemorySnippet({
      ownerId: "member:alice",
      sessionId: "s1",
      kind: "note",
      sourceId: "ev-strong",
      text: "Mechanism design incentive compatible rules for selfish agents",
    });
    addMemorySnippet({
      ownerId: "member:alice",
      sessionId: "s1",
      kind: "note",
      sourceId: "ev-weak",
      text: "Agents design notes about something else entirely unrelated",
    });
    const hybrid = searchPrivateMemory({ ownerId: "member:alice", query: "incentive compatible mechanism design", limit: 2 });
    expect(hybrid[0].sourceId).toBe("ev-strong");
    expect(hybrid[0].matchedVia).toBe("both");
    // Lexical-only ablation still works on the same query.
    const lexical = searchPrivateMemory({ ownerId: "member:alice", query: "incentive compatible mechanism design", limit: 2, mode: "lexical-only" });
    expect(lexical[0].sourceId).toBe("ev-strong");
  });

  it("reranks by relevance and reports how a snippet matched", () => {
    seed();
    const hits = searchPrivateMemory({ ownerId: "member:alice", query: "mechanism design", limit: 2 });
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[hits.length - 1].score);
    expect(["lexical", "semantic", "both"]).toContain(hits[0].matchedVia);
  });
});
