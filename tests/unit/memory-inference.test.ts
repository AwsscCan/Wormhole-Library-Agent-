import { beforeEach, describe, expect, it } from "vitest";
import {
  appendLearningEvent,
  forgetInferredPreferencesByConcept,
  listInferredPreferences,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  revokeInferredPreference,
} from "@/lib/research/memory";

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
});

describe("package 04 preference inference", () => {
  it("a single feedback event never generalizes into a long-term preference", () => {
    appendLearningEvent({
      ownerId: "member:alice",
      sessionId: "s1",
      kind: "feedback",
      rating: "too_hard",
      conceptId: "game-theory",
      resourceId: "r1",
    });
    expect(listInferredPreferences("member:alice")).toHaveLength(0);
  });

  it("behaviour inside one session only still does not generalize", () => {
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "favorite", conceptId: "game-theory" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "read_complete", conceptId: "game-theory" });
    expect(listInferredPreferences("member:alice")).toHaveLength(0);
  });

  it("cross-session repeated behaviour raises confidence with visible evidence count", () => {
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "favorite", conceptId: "game-theory", at: "2026-08-01T10:00:00.000Z" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", conceptId: "game-theory", text: "n", at: "2026-08-01T11:00:00.000Z" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "cite", conceptId: "game-theory", at: "2026-08-05T10:00:00.000Z" });

    const prefs = listInferredPreferences("member:alice");
    expect(prefs).toHaveLength(1);
    const pref = prefs[0];
    expect(pref.conceptId).toBe("game-theory");
    expect(pref.evidenceCount).toBe(3);
    expect(pref.evidenceEventIds).toHaveLength(3);
    expect(pref.lastConfirmedAt).toBe("2026-08-05T10:00:00.000Z");
    expect(pref.confidence).toBeGreaterThan(0.3);
    expect(pref.expiresAt > pref.lastConfirmedAt).toBe(true);
  });

  it("more distinct sessions mean higher confidence, capped", () => {
    for (let session = 1; session <= 5; session += 1) {
      appendLearningEvent({
        ownerId: "member:alice",
        sessionId: `s${session}`,
        kind: "excerpt",
        conceptId: "mechanism-design",
        at: `2026-08-0${session}T10:00:00.000Z`,
      });
    }
    const prefs = listInferredPreferences("member:alice");
    expect(prefs).toHaveLength(1);
    expect(prefs[0].confidence).toBeLessThanOrEqual(0.95);
    expect(prefs[0].evidenceCount).toBe(5);
  });

  it("expired preferences disappear from listings", () => {
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "favorite", conceptId: "old-topic", at: "2025-01-01T00:00:00.000Z" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "favorite", conceptId: "old-topic", at: "2025-01-02T00:00:00.000Z" });
    expect(listInferredPreferences("member:alice")).toHaveLength(0);
  });

  it("revoke removes the inference and it stays revoked after recompute", async () => {
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", conceptId: "ml", text: "x" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "note", conceptId: "ml", text: "y" });
    const [pref] = listInferredPreferences("member:alice");
    expect(await revokeInferredPreference("member:alice", pref.id)).toBe(true);
    expect(listInferredPreferences("member:alice")).toHaveLength(0);
    // New behaviour must not silently resurrect a revoked inference.
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s3", kind: "cite", conceptId: "ml" });
    expect(listInferredPreferences("member:alice")).toHaveLength(0);
  });

  it("forget by concept revokes every matching inference for the owner only", async () => {
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "note", conceptId: "ml", text: "x" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "note", conceptId: "ml", text: "y" });
    appendLearningEvent({ ownerId: "member:bob", sessionId: "t1", kind: "note", conceptId: "ml", text: "x" });
    appendLearningEvent({ ownerId: "member:bob", sessionId: "t2", kind: "note", conceptId: "ml", text: "y" });

    expect(await forgetInferredPreferencesByConcept("member:alice", "ml")).toBe(1);
    expect(listInferredPreferences("member:alice")).toHaveLength(0);
    expect(listInferredPreferences("member:bob")).toHaveLength(1);
  });

  it("preferences are never shared across owners", () => {
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s1", kind: "favorite", conceptId: "graph" });
    appendLearningEvent({ ownerId: "member:alice", sessionId: "s2", kind: "favorite", conceptId: "graph" });
    expect(listInferredPreferences("member:bob")).toHaveLength(0);
  });
});
