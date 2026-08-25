import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendExplorationFeedback,
  bindExplorationEventPort,
  bindMemoryReadPort,
  clearWorkbenchPortsForTests,
  readMemorySummary,
} from "@/lib/workbench/ports";

afterEach(() => clearWorkbenchPortsForTests());

describe("bounded package 04 and event ports", () => {
  it("degrades explicitly when the memory summary port is absent", async () => {
    await expect(readMemorySummary("member:alice", "session-1")).resolves.toEqual({
      status: "unavailable", summary: null, message: "Memory summary port is not integrated",
    });
  });

  it("reads only the bounded summary contract", async () => {
    const read = vi.fn(async () => ({ status: "available" as const, summary: "Prefers primary sources" }));
    bindMemoryReadPort({ readSummary: read });
    await expect(readMemorySummary("member:alice", "session-1")).resolves.toMatchObject({ status: "available" });
    expect(read).toHaveBeenCalledWith({ ownerId: "member:alice", sessionId: "session-1" });
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
});
