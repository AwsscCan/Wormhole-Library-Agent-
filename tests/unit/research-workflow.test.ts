import { describe, expect, it, vi } from "vitest";
import { InMemoryResearchSessionStore, ResearchSessionService } from "@/lib/research/sessionStore";
import { ResearchWorkspace } from "@/lib/research/workspace";

function setup() {
  let n = 0;
  const sessions = new ResearchSessionService(new InMemoryResearchSessionStore(), {
    now: () => "2026-08-24T12:00:00.000Z",
    id: (prefix) => `${prefix}-${++n}`,
  });
  const search = vi.fn(async ({ userId, query }: { userId: string; query: string }) => ({
    interactionId: "int-42", query, concepts: [{ id: "rag", name: "RAG" }],
    resources: [{
      id: "paper-1", type: "paper" as const, title: "RAG Survey", authors: [], language: "en" as const,
      why: "grounding", availability: "online" as const, difficulty: "research" as const,
      concepts: [{ id: "rag", name: "RAG" }], qualityScore: 0.9,
    }],
    readingPath: ["RAG"], memoryUsed: [`owner:${userId}`],
  }));
  const library = vi.fn(async () => ({ resources: [], sourceStatus: "live" as const, degraded: false }));
  const workspace = new ResearchWorkspace(sessions, { search, library });
  return { sessions, workspace, search, library };
}

describe("ResearchWorkspace closed loop", () => {
  it("searches as the server principal and writes interaction/resources back to the same session", async () => {
    const { sessions, workspace, search } = setup();
    const session = await sessions.create("member:alice", { researchQuestion: "Evaluate RAG" });
    const result = await workspace.act("member:alice", session.id, { action: "search", nodeId: "topic", topic: "hybrid retrieval" });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ userId: "member:alice", query: "hybrid retrieval — Evaluate RAG" }));
    expect(result).toMatchObject({ action: "search", sessionId: session.id, interactionId: "int-42" });
    const restored = await sessions.get("member:alice", session.id);
    expect(restored.interactionIds).toEqual(["int-42"]);
    expect(restored.searches[0].resources[0].id).toBe("paper-1");
  });

  it("returns a truthful source failure instead of an empty result", async () => {
    const { sessions, workspace, library } = setup();
    const session = await sessions.create("guest:one", { researchQuestion: "Source resilience" });
    library.mockRejectedValueOnce(new Error("upstream unavailable"));
    await expect(workspace.act("guest:one", session.id, { action: "library", nodeId: "topic", topic: "RAG" }))
      .rejects.toMatchObject({ code: "SOURCE_FAILURE" });
  });

  it("adds a resource to the evidence basket without accepting another owner", async () => {
    const { sessions, workspace } = setup();
    const session = await sessions.create("member:alice", { researchQuestion: "Evidence" });
    await workspace.act("member:alice", session.id, { action: "add_evidence", nodeId: "resource:paper-1", topic: "RAG", resourceId: "paper-1" });
    expect((await sessions.get("member:alice", session.id)).evidenceIds).toEqual(["paper-1"]);
    await expect(workspace.act("member:bob", session.id, { action: "search", nodeId: "topic", topic: "RAG" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("migrates an owned legacy interaction and rejects expired or foreign interactions", async () => {
    const { workspace } = setup();
    const interaction = {
      id: "int-old", userId: "member:alice", query: "legacy RAG", sliderValue: 50,
      conceptIds: ["rag"], createdAt: "2026-08-24T11:00:00.000Z",
      searchResponse: {
        interactionId: "int-old", query: "legacy RAG", concepts: [{ id: "rag", name: "RAG" }], resources: [],
        readingPath: ["RAG"], memoryUsed: [],
      },
    };
    await expect(workspace.migrateInteraction("member:alice", "int-old", () => interaction)).resolves.toMatchObject({ interactionIds: ["int-old"] });
    await expect(workspace.migrateInteraction("member:bob", "int-old", () => interaction)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(workspace.migrateInteraction("member:alice", "missing", () => null)).rejects.toMatchObject({ code: "EXPIRED_INTERACTION" });
  });
});
