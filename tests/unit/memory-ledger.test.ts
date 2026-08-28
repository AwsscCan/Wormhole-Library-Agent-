import { beforeEach, describe, expect, it } from "vitest";
import {
  appendLearningEvent,
  findLearningEvent,
  listLearningEvents,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
} from "@/lib/research/memory";

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
});

describe("package 04 learning event ledger", () => {
  it("appends events immutably with generated ids and timestamps", () => {
    const first = appendLearningEvent({ ownerId: "member:alice", kind: "search", query: "wormhole" });
    const second = appendLearningEvent({ ownerId: "member:alice", kind: "note", text: "n1" });
    expect(first.id).not.toBe(second.id);
    expect(first.at).toBeTruthy();
    expect(first.kind).toBe("search");
  });

  it("is owner-scoped: bob never sees alice events", () => {
    appendLearningEvent({ ownerId: "member:alice", kind: "favorite", conceptId: "ml" });
    appendLearningEvent({ ownerId: "member:bob", kind: "favorite", conceptId: "graph" });
    const alice = listLearningEvents({ ownerId: "member:alice" });
    const bob = listLearningEvents({ ownerId: "member:bob" });
    expect(alice).toHaveLength(1);
    expect(alice[0].ownerId).toBe("member:alice");
    expect(bob).toHaveLength(1);
    expect(bob[0].conceptId).toBe("graph");
  });

  it("filters by session when requested", () => {
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "open" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "open" });
    expect(listLearningEvents({ ownerId: "member:alice", sessionId: "s1" })).toHaveLength(1);
    expect(listLearningEvents({ ownerId: "member:alice" })).toHaveLength(2);
  });

  it("findLearningEvent refuses cross-owner lookups", () => {
    const event = appendLearningEvent({ ownerId: "member:alice", kind: "note", text: "x" });
    expect(findLearningEvent("member:bob", event.id)).toBeUndefined();
    expect(findLearningEvent("member:alice", event.id)).toBeDefined();
  });

  it("rejects events without an owner", () => {
    expect(() => appendLearningEvent({ ownerId: "", kind: "open" })).toThrow();
  });
});
