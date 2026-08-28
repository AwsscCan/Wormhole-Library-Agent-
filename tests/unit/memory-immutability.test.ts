/**
 * Package 04 账本/索引/推断的不可变性与唯一 ID 回归测试（验收报告 F-003 / E-004）。
 *
 * 红线：读写边界必须返回深拷贝，调用方改返回对象不得污染已存账本/索引；
 * append 必须拒绝重复 id。
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  addMemorySnippet,
  appendLearningEvent,
  findInferredPreference,
  findLearningEvent,
  listInferredPreferences,
  listLearningEvents,
  recordLearningEvent,
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

describe("package 04 reference isolation", () => {
  it("mutating the returned event does not rewrite the ledger", () => {
    appendLearningEvent({ ownerId: "member:alice", kind: "note", text: "original", query: "q" });
    const read = listLearningEvents({ ownerId: "member:alice" })[0];
    read.query = "corrupted";
    read.text = "tampered";
    const again = listLearningEvents({ ownerId: "member:alice" })[0];
    expect(again.query).toBe("q");
    expect(again.text).toBe("original");
  });

  it("findLearningEvent returns an isolated copy", () => {
    const event = appendLearningEvent({ ownerId: "member:alice", kind: "open", resourceId: "r1" });
    const found = findLearningEvent("member:alice", event.id)!;
    found.resourceId = "r99";
    expect(findLearningEvent("member:alice", event.id)!.resourceId).toBe("r1");
  });

  it("mutating a returned snippet does not rewrite the index", () => {
    addMemorySnippet({ ownerId: "member:alice", sessionId: "s1", sourceId: "e1", kind: "note", text: "private note" });
    const hit = searchPrivateMemory({ ownerId: "member:alice", query: "private note", limit: 5 })[0];
    hit.text = "tampered text";
    const again = searchPrivateMemory({ ownerId: "member:alice", query: "private note", limit: 5 })[0];
    expect(again.text).toBe("private note");
  });

  it("mutating a returned preference does not rewrite inference state", () => {
    recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "favorite", conceptId: "ml" });
    recordLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "note", conceptId: "ml", text: "ml notes" });
    const prefs = listInferredPreferences("member:alice");
    expect(prefs).toHaveLength(1);
    prefs[0].confidence = 0.0;
    prefs[0].conceptId = "tampered";
    const again = listInferredPreferences("member:alice")[0];
    expect(again.conceptId).toBe("ml");
    expect(again.confidence).toBeGreaterThan(0);
    expect(findInferredPreference("member:alice", again.id)!.conceptId).toBe("ml");
  });

  it("rejects a duplicate learning-event id (append-only identity validation)", () => {
    appendLearningEvent({ ownerId: "member:alice", id: "le-fixed", kind: "open" });
    expect(() => appendLearningEvent({ ownerId: "member:alice", id: "le-fixed", kind: "note" })).toThrow(/already exists/);
  });

  it("rejects a duplicate snippet id", () => {
    addMemorySnippet({ ownerId: "member:alice", sessionId: "s1", sourceId: "e1", id: "snip-fixed", kind: "note", text: "a" });
    expect(() => addMemorySnippet({ ownerId: "member:alice", sessionId: "s1", sourceId: "e2", id: "snip-fixed", kind: "note", text: "b" })).toThrow(/already exists/);
  });
});
