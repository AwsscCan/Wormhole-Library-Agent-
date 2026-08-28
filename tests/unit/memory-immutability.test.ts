/**
 * Package 04 账本/索引/推断的不可变性与唯一 ID 回归测试（验收报告 F-002 / E-002）。
 *
 * 红线：入库前必须深拷贝完整 input（含嵌套 provenance），返回时也要深拷贝——
 * 调用方改原对象或改返回对象，都不得污染已存账本/索引；append 必须拒绝重复 id。
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
  resetSemanticEmbedderForTests,
  searchPrivateMemory,
} from "@/lib/research/memory";
import type { LearningEventKind } from "@/lib/research/memory";

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
  resetSemanticEmbedderForTests();
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

  it("mutating the caller's nested provenance input does not rewrite the stored event", () => {
    const provenance = { sourceKind: "openalex" as const, sourceLabel: "OpenAlex", retrievedAt: "2026-08-28T00:00:00.000Z" };
    const input: { ownerId: string; kind: LearningEventKind; text: string; provenance: typeof provenance } = {
      ownerId: "member:alice", kind: "note", text: "x", provenance,
    };
    const event = appendLearningEvent(input);

    // 篡改调用方手里的原始嵌套对象与字段
    provenance.sourceLabel = "Tampered";
    input.kind = "feedback";

    const stored = findLearningEvent("member:alice", event.id)!;
    expect(stored.provenance?.sourceLabel).toBe("OpenAlex");
    expect(stored.kind).toBe("note");
  });

  it("mutating the caller's nested provenance input does not rewrite the stored snippet", async () => {
    const provenance = { sourceKind: "openlibrary" as const, sourceLabel: "Open Library", retrievedAt: "2026-08-28T00:00:00.000Z" };
    await addMemorySnippet({ ownerId: "member:alice", sessionId: "s1", sourceId: "e1", kind: "note", text: "private note", provenance });
    provenance.sourceLabel = "Tampered";

    const hit = (await searchPrivateMemory({ ownerId: "member:alice", query: "private note", limit: 5 }))[0];
    expect(hit.provenance?.sourceLabel).toBe("Open Library");
  });

  it("mutating a returned snippet does not rewrite the index", async () => {
    await addMemorySnippet({ ownerId: "member:alice", sessionId: "s1", sourceId: "e1", kind: "note", text: "private note" });
    const hit = (await searchPrivateMemory({ ownerId: "member:alice", query: "private note", limit: 5 }))[0];
    hit.text = "tampered text";
    const again = (await searchPrivateMemory({ ownerId: "member:alice", query: "private note", limit: 5 }))[0];
    expect(again.text).toBe("private note");
  });

  it("mutating a returned preference does not rewrite inference state", async () => {
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "favorite", conceptId: "ml" });
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "note", conceptId: "ml", text: "ml notes" });
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

  it("rejects a duplicate snippet id", async () => {
    await addMemorySnippet({ ownerId: "member:alice", sessionId: "s1", sourceId: "e1", id: "snip-fixed", kind: "note", text: "a" });
    await expect(
      addMemorySnippet({ ownerId: "member:alice", sessionId: "s1", sourceId: "e2", id: "snip-fixed", kind: "note", text: "b" }),
    ).rejects.toThrow(/already exists/);
  });
});
