/**
 * Package 04 持久化与重启恢复测试（验收报告 F-005 / E-006）。
 *
 * 证明账本 / 索引 / 推断 / 撤销状态在「进程重启」（重置 globalThis + 从快照恢复）
 * 后不丢失，且恢复后的检索与偏好推理照常工作。
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryMemoryPersistenceStore,
  listInferredPreferences,
  listLearningEvents,
  loadMemoryState,
  persistMemoryState,
  recordLearningEvent,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  restoreMemoryState,
  revokeInferredPreference,
  searchPrivateMemory,
  setMemoryPersistenceStoreForTests,
  snapshotMemoryState,
} from "@/lib/research/memory";

function recordFixture(): void {
  recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", conceptId: "ml", text: "machine learning course notes" });
  recordLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "cite", conceptId: "ml" });
  recordLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "favorite", conceptId: "graph" });
  recordLearningEvent({ ownerId: "member:alice", sessionId: "s3", kind: "note", conceptId: "graph", text: "graph theory notes" });
}

function resetAll(): void {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
}

beforeEach(() => {
  resetAll();
  setMemoryPersistenceStoreForTests(new InMemoryMemoryPersistenceStore());
});

describe("package 04 snapshot/restore persistence", () => {
  it("survives a process restart: events, snippets, preferences and revocations all come back", () => {
    recordFixture();
    // 触发偏好推断：ml + graph 两个概念各跨 2 个 session
    const prefs = listInferredPreferences("member:alice");
    expect(prefs).toHaveLength(2);
    // 撤销 ml 这一条
    const mlPref = prefs.find((p) => p.conceptId === "ml")!;
    revokeInferredPreference("member:alice", mlPref.id);

    const snapshot = snapshotMemoryState();
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(snapshot.snippets.length).toBeGreaterThan(0);
    expect(snapshot.preferences.length).toBe(2);
    expect(snapshot.revoked.length).toBe(1);

    // 模拟新进程：清空 globalThis
    resetAll();
    expect(listLearningEvents({ ownerId: "member:alice" })).toHaveLength(0);
    expect(searchPrivateMemory({ ownerId: "member:alice", query: "machine learning", limit: 5 })).toHaveLength(0);

    // 从快照恢复
    restoreMemoryState(snapshot);

    expect(listLearningEvents({ ownerId: "member:alice" }).length).toBe(snapshot.events.length);
    expect(searchPrivateMemory({ ownerId: "member:alice", query: "machine learning", limit: 5 }).length).toBeGreaterThan(0);
    // 未撤销的 graph 偏好存活，被撤销的 ml 不复活
    const restoredPrefs = listInferredPreferences("member:alice");
    expect(restoredPrefs).toHaveLength(1);
    expect(restoredPrefs[0].conceptId).toBe("graph");
  });

  it("round-trips through the persistence store (persist → reset → load)", async () => {
    recordFixture();
    listInferredPreferences("member:alice"); // 触发推断
    await persistMemoryState();

    resetAll();
    const loaded = await loadMemoryState();
    expect(loaded).toBe(true);

    expect(listLearningEvents({ ownerId: "member:alice" }).length).toBeGreaterThan(0);
    expect(searchPrivateMemory({ ownerId: "member:alice", query: "machine learning", limit: 5 }).length).toBeGreaterThan(0);
    expect(listInferredPreferences("member:alice").length).toBeGreaterThan(0);
  });

  it("returns false when nothing is persisted yet", async () => {
    resetAll();
    await expect(loadMemoryState()).resolves.toBe(false);
  });

  it("restored snippets stay owner-scoped and retrievable", () => {
    recordLearningEvent({ ownerId: "member:bob", sessionId: "t1", kind: "note", text: "bob private graph notes" });
    const snapshot = snapshotMemoryState();
    resetAll();
    restoreMemoryState(snapshot);

    expect(searchPrivateMemory({ ownerId: "member:alice", query: "graph notes", limit: 5 })).toHaveLength(0);
    expect(searchPrivateMemory({ ownerId: "member:bob", query: "graph notes", limit: 5 }).length).toBeGreaterThan(0);
  });
});
