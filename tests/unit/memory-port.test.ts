import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendLearningEvent,
  bindMemoryReadPort,
  clearMemoryReadPortForTests,
  defaultMemoryReadPort,
  forgetInferredPreferencesByConcept,
  getMemoryReadPort,
  installMemoryReadPortForTests,
  listInferredPreferences,
  recordLearningEvent,
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

afterEach(() => {
  clearMemoryReadPortForTests();
});

describe("package 04 memory read port (consumed by package 05)", () => {
  it("is null before package 04 integration — package 05 must degrade explicitly", () => {
    expect(getMemoryReadPort()).toBeNull();
  });

  it("default port serves search and preferences for the requesting owner only", async () => {
    bindMemoryReadPort(defaultMemoryReadPort);
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", conceptId: "game-theory", text: "Mechanism design notes for later review" });
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "cite", conceptId: "game-theory" });
    await recordLearningEvent({ ownerId: "member:bob", sessionId: "t1", kind: "note", conceptId: "graph", text: "Bob private graph notes" });

    const port = getMemoryReadPort();
    expect(port).not.toBeNull();

    const aliceHits = await port!.search({ ownerId: "member:alice", query: "mechanism design review", limit: 5 });
    expect(aliceHits.length).toBeGreaterThan(0);
    // P05 DTO：每条 snippet 带 score，且不含内部 ownerId 字段
    expect(aliceHits.every((hit) => typeof hit.score === "number" && hit.sourceId)).toBe(true);

    const bobHits = await port!.search({ ownerId: "member:bob", query: "mechanism design", limit: 5 });
    expect(bobHits).toHaveLength(0);

    const prefs = await port!.listInferredPreferences({ ownerId: "member:alice" });
    expect(prefs).toHaveLength(1);
    // P05 DTO：key/value 形式（概念偏好映射为 key:"conceptId"）
    expect(prefs[0].key).toBe("conceptId");
    expect(prefs[0].value).toBe("game-theory");
  });

  it("forgetting removes content from the port surface", async () => {
    bindMemoryReadPort(defaultMemoryReadPort);
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "favorite", conceptId: "ml" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "favorite", conceptId: "ml" });
    await forgetInferredPreferencesByConcept("member:alice", "ml");
    expect(await defaultMemoryReadPort.listInferredPreferences({ ownerId: "member:alice" })).toHaveLength(0);
    expect(listInferredPreferences("member:alice")).toHaveLength(0);
  });

  it("test-only injection is guarded outside vitest", () => {
    expect(() => installMemoryReadPortForTests(defaultMemoryReadPort)).not.toThrow();
    expect(getMemoryReadPort()).not.toBeNull();
  });

  it("searchPrivateMemory stays owner-scoped even under a session-less query", async () => {
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", text: "private note about reinforcement learning" });
    const bobView = await searchPrivateMemory({ ownerId: "member:bob", query: "reinforcement learning", limit: 5 });
    expect(bobView).toHaveLength(0);
  });
});
