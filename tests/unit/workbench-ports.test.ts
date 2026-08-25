import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendExplorationFeedback,
  bindExplorationEventPort,
  bindPackage04MemoryReadPort,
  clearWorkbenchPortsForTests,
  readMemorySummary,
} from "@/lib/workbench/ports";

afterEach(() => clearWorkbenchPortsForTests());

describe("bounded package 04 and event ports", () => {
  it("degrades explicitly when the memory summary port is absent", async () => {
    await expect(readMemorySummary("member:alice", "session-1")).resolves.toEqual({
      status: "unavailable", snippets: [], preferences: [], message: "Package 04 MemoryReadPort is not integrated",
    });
  });

  it("reads only the bounded summary contract", async () => {
    const search = vi.fn(async () => [{ id: "snippet-1", sourceId: "note-1", sessionId: "session-1", createdAt: "2026-08-25T00:00:00.000Z", text: "Prefers primary sources" }]);
    const listInferredPreferences = vi.fn(async () => [{ id: "pref-1", key: "sources", value: "primary", confidence: 0.9, evidenceCount: 3 }]);
    bindPackage04MemoryReadPort({ search, listInferredPreferences });
    await expect(readMemorySummary("member:alice", "session-1", "RAG evidence")).resolves.toMatchObject({
      status: "available", snippets: [{ sourceId: "note-1" }], preferences: [{ id: "pref-1" }],
    });
    expect(search).toHaveBeenCalledWith({ ownerId: "member:alice", sessionId: "session-1", query: "RAG evidence", limit: 8 });
    expect(listInferredPreferences).toHaveBeenCalledWith({ ownerId: "member:alice" });
  });

  it("writes feedback to the event port without emitting preference patches", async () => {
    const append = vi.fn(async () => ({ accepted: true }));
    bindExplorationEventPort({ append });
    await expect(appendExplorationFeedback({
      ownerId: "member:alice", sessionId: "session-1", recommendationId: "rec-1", feedback: "too_far",
      occurredAt: "2026-08-25T00:00:00.000Z",
    })).resolves.toEqual({ accepted: true, status: "recorded" });
    expect(append).toHaveBeenCalledWith(expect.not.objectContaining({ preference: expect.anything(), memoryPatch: expect.anything() }));
  });

  it("preserves a downstream feedback rejection instead of reporting recorded", async () => {
    bindExplorationEventPort({ append: async () => ({ accepted: false }) });
    await expect(appendExplorationFeedback({ ownerId: "member:alice", sessionId: "session-1",
      recommendationId: "rec-rejected", feedback: "too_far", occurredAt: "2026-08-25T00:00:00.000Z" }))
      .resolves.toEqual({ accepted: false, status: "rejected" });
  });
});
