/**
 * Package 04 持久化与重启恢复测试（验收报告 F-004 / E-004）。
 *
 * 覆盖：写后自动持久化、启动恢复、恢复后继续写（nextId 连续）、删除/撤销后恢复、
 * owner 隔离。
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryMemoryPersistenceStore,
  addMemorySnippet,
  deleteMemorySnippet,
  forgetSession,
  listInferredPreferences,
  listLearningEvents,
  loadMemoryState,
  persistMemoryState,
  recordLearningEvent,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  resetSemanticEmbedderForTests,
  restoreMemoryState,
  revokeInferredPreference,
  searchPrivateMemory,
  setMemoryPersistenceStoreForTests,
  snapshotMemoryState,
} from "@/lib/research/memory";

function resetAll(): void {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
  resetSemanticEmbedderForTests();
}

beforeEach(() => {
  resetAll();
  setMemoryPersistenceStoreForTests(new InMemoryMemoryPersistenceStore());
});

describe("package 04 snapshot/restore persistence", () => {
  it("does not roll back another owner's successful concurrent write", async () => {
    let rejectFirst!: () => void;
    let saveCalls = 0;
    setMemoryPersistenceStoreForTests({
      load: async () => null,
      save: async () => {
        saveCalls += 1;
        if (saveCalls === 1) {
          await new Promise<void>((_resolve, reject) => { rejectFirst = () => reject(new Error("disk unavailable")); });
        }
      },
    });

    const failed = recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "feedback", rating: "useful" });
    await Promise.resolve();
    const successful = recordLearningEvent({ ownerId: "member:bob", sessionId: "s2", kind: "feedback", rating: "useful" });
    await Promise.resolve();
    rejectFirst();

    await expect(failed).rejects.toThrow("disk unavailable");
    await expect(successful).resolves.toMatchObject({ ownerId: "member:bob" });
    expect(listLearningEvents({ ownerId: "member:alice" })).toEqual([]);
    expect(listLearningEvents({ ownerId: "member:bob" })).toHaveLength(1);
  });

  it("survives a process restart: events, snippets, preferences and revocations all come back", async () => {
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", conceptId: "ml", text: "machine learning course notes" });
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "cite", conceptId: "ml" });
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "note", conceptId: "graph", text: "graph notes" });
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s3", kind: "favorite", conceptId: "graph" });

    const prefs = listInferredPreferences("member:alice");
    expect(prefs).toHaveLength(2);
    const mlPref = prefs.find((p) => p.conceptId === "ml")!;
    await revokeInferredPreference("member:alice", mlPref.id);

    const snapshot = snapshotMemoryState();
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(snapshot.snippets.length).toBeGreaterThan(0);
    expect(snapshot.preferences.length).toBe(2);
    expect(snapshot.revoked.length).toBe(1);

    resetAll();
    expect(listLearningEvents({ ownerId: "member:alice" })).toHaveLength(0);
    expect(await searchPrivateMemory({ ownerId: "member:alice", query: "machine learning", limit: 5 })).toHaveLength(0);

    await restoreMemoryState(snapshot);

    expect(listLearningEvents({ ownerId: "member:alice" }).length).toBe(snapshot.events.length);
    expect((await searchPrivateMemory({ ownerId: "member:alice", query: "machine learning", limit: 5 })).length).toBeGreaterThan(0);
    // 未撤销的 graph 偏好存活，被撤销的 ml 不复活
    const restoredPrefs = listInferredPreferences("member:alice");
    expect(restoredPrefs).toHaveLength(1);
    expect(restoredPrefs[0].conceptId).toBe("graph");
  });

  it("restores nextId continuity: appending after restart does not collide", async () => {
    await addMemorySnippet({ ownerId: "member:alice", sessionId: "s1", sourceId: "e1", id: "snip-1", kind: "note", text: "first" });
    const snapshot = snapshotMemoryState();
    resetAll();
    await restoreMemoryState(snapshot);

    const next = await addMemorySnippet({ ownerId: "member:alice", sessionId: "s2", sourceId: "e2", kind: "note", text: "second" });
    expect(next.id).toBe("snip-2"); // 不再重置回 1，无 ID 冲突
    expect((await searchPrivateMemory({ ownerId: "member:alice", query: "second", limit: 5 })).length).toBeGreaterThan(0);
  });

  it("writes persist automatically through the write facade, then recover on load", async () => {
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", conceptId: "ml", text: "machine learning notes" });
    listInferredPreferences("member:alice");

    resetAll();
    const loaded = await loadMemoryState();
    expect(loaded).toBe(true);

    expect(listLearningEvents({ ownerId: "member:alice" }).length).toBeGreaterThan(0);
    expect((await searchPrivateMemory({ ownerId: "member:alice", query: "machine learning", limit: 5 })).length).toBeGreaterThan(0);
  });

  it("deletes and forgets persist: content stays gone after restart", async () => {
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", conceptId: "ml", text: "sensitive note to be deleted" });
    const [hit] = await searchPrivateMemory({ ownerId: "member:alice", query: "sensitive note", limit: 5 });
    await deleteMemorySnippet("member:alice", hit.id);

    resetAll();
    await loadMemoryState();
    expect(await searchPrivateMemory({ ownerId: "member:alice", query: "sensitive note", limit: 5 })).toHaveLength(0);
  });

  it("revocations persist: a revoked preference never resurrects after restart", async () => {
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", conceptId: "ml", text: "a" });
    await recordLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "note", conceptId: "ml", text: "b" });
    const [pref] = listInferredPreferences("member:alice");
    await revokeInferredPreference("member:alice", pref.id);

    resetAll();
    await loadMemoryState();
    expect(listInferredPreferences("member:alice")).toHaveLength(0);
  });

  it("returns false when nothing is persisted yet", async () => {
    resetAll();
    await expect(loadMemoryState()).resolves.toBe(false);
  });

  it("restored snippets stay owner-scoped and retrievable", async () => {
    await recordLearningEvent({ ownerId: "member:bob", sessionId: "t1", kind: "note", text: "bob private graph notes" });
    const snapshot = snapshotMemoryState();
    resetAll();
    await restoreMemoryState(snapshot);

    expect(await searchPrivateMemory({ ownerId: "member:alice", query: "graph notes", limit: 5 })).toHaveLength(0);
    expect((await searchPrivateMemory({ ownerId: "member:bob", query: "graph notes", limit: 5 })).length).toBeGreaterThan(0);
  });
});
