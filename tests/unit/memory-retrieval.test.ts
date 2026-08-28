import { beforeEach, describe, expect, it } from "vitest";
import {
  addMemorySnippet,
  deleteMemorySnippet,
  forgetSession,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  resetSemanticEmbedderForTests,
  searchPrivateMemory,
} from "@/lib/research/memory";

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
  resetSemanticEmbedderForTests();
});

async function seed() {
  await addMemorySnippet({
    ownerId: "member:alice",
    sessionId: "s1",
    kind: "note",
    sourceId: "ev-1",
    conceptId: "game-theory",
    text: "Mechanism design studies how to design rules of a game so that selfish behaviour leads to good outcomes.",
  });
  await addMemorySnippet({
    ownerId: "member:alice",
    sessionId: "s2",
    kind: "excerpt",
    sourceId: "ev-2",
    conceptId: "multi-agent",
    text: "Multi-agent coordination requires communication protocols and shared world models.",
  });
}

describe("package 04 private retrieval", () => {
  it("never returns another owner's snippets", async () => {
    await seed();
    await addMemorySnippet({
      ownerId: "member:bob",
      sessionId: "t1",
      kind: "note",
      sourceId: "ev-b",
      text: "Mechanism design notes from bob",
    });
    const hits = await searchPrivateMemory({ ownerId: "member:alice", query: "mechanism design", limit: 10 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.ownerId === "member:alice")).toBe(true);
  });

  it("session-scoped search only sees that session", async () => {
    await seed();
    const hits = await searchPrivateMemory({ ownerId: "member:alice", sessionId: "s2", query: "coordination", limit: 10 });
    expect(hits).toHaveLength(1);
    expect(hits[0].sessionId).toBe("s2");
  });

  it("deleted snippets can never be recalled again", async () => {
    await seed();
    const before = await searchPrivateMemory({ ownerId: "member:alice", query: "multi-agent coordination", limit: 10 });
    expect(before.length).toBeGreaterThan(0);
    expect(await deleteMemorySnippet("member:alice", before[0].id)).toBe(true);
    const after = await searchPrivateMemory({ ownerId: "member:alice", query: "multi-agent coordination", limit: 10 });
    expect(after.find((hit) => hit.id === before[0].id)).toBeUndefined();
  });

  it("delete is owner-guarded: bob cannot delete alice's snippet", async () => {
    await seed();
    const [hit] = await searchPrivateMemory({ ownerId: "member:alice", query: "mechanism", limit: 1 });
    expect(await deleteMemorySnippet("member:bob", hit.id)).toBe(false);
    expect((await searchPrivateMemory({ ownerId: "member:alice", query: "mechanism", limit: 1 })).length).toBeGreaterThan(0);
  });

  it("forgetting a session drops all of its snippets from retrieval", async () => {
    await seed();
    expect(await forgetSession("member:alice", "s1")).toBe(1);
    expect(await searchPrivateMemory({ ownerId: "member:alice", query: "mechanism design rules", limit: 10 })).toHaveLength(0);
    expect((await searchPrivateMemory({ ownerId: "member:alice", query: "coordination", limit: 10 })).length).toBeGreaterThan(0);
  });

  it("reformulated research questions still recall the note with source and time kept", async () => {
    await addMemorySnippet({
      ownerId: "member:alice",
      sessionId: "s1",
      kind: "note",
      sourceId: "ev-1",
      text: "Selfish agents need incentive compatible rules to reach good outcomes.",
      createdAt: "2026-08-20T10:00:00.000Z",
    });
    const reformulated = await searchPrivateMemory({ ownerId: "member:alice", query: "what rules give selfish agents right incentives", limit: 5 });
    expect(reformulated.length).toBeGreaterThan(0);
    expect(reformulated[0].sourceId).toBe("ev-1");
    expect(reformulated[0].createdAt).toBe("2026-08-20T10:00:00.000Z");
  });

  it("hybrid retrieval ranks the strongly matching note first, marked as both", async () => {
    await addMemorySnippet({
      ownerId: "member:alice",
      sessionId: "s1",
      kind: "note",
      sourceId: "ev-strong",
      text: "Mechanism design incentive compatible rules for selfish agents",
    });
    await addMemorySnippet({
      ownerId: "member:alice",
      sessionId: "s1",
      kind: "note",
      sourceId: "ev-weak",
      text: "Agents design notes about something else entirely unrelated",
    });
    const hybrid = await searchPrivateMemory({ ownerId: "member:alice", query: "incentive compatible mechanism design", limit: 2 });
    expect(hybrid[0].sourceId).toBe("ev-strong");
    expect(hybrid[0].matchedVia).toBe("both");
    const lexical = await searchPrivateMemory({ ownerId: "member:alice", query: "incentive compatible mechanism design", limit: 2, mode: "lexical-only" });
    expect(lexical[0].sourceId).toBe("ev-strong");
  });

  it("reranks by relevance and reports how a snippet matched", async () => {
    await seed();
    const hits = await searchPrivateMemory({ ownerId: "member:alice", query: "mechanism design", limit: 2 });
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[hits.length - 1].score);
    expect(["lexical", "semantic", "both"]).toContain(hits[0].matchedVia);
  });
});
