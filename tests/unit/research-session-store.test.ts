import { describe, expect, it } from "vitest";
import { InMemoryResearchSessionStore, ResearchSessionService } from "@/lib/research/sessionStore";

function fixture() {
  let sequence = 0;
  const store = new InMemoryResearchSessionStore();
  const service = new ResearchSessionService(store, {
    now: () => "2026-08-24T12:00:00.000Z",
    id: (prefix) => `${prefix}-${++sequence}`,
  });
  return { store, service };
}

describe("ResearchSessionStore", () => {
  it("persists a session and restores the same private graph after restart", async () => {
    const { store, service } = fixture();
    const session = await service.create("member:alice", {
      researchQuestion: "How do vector databases support RAG?",
      writingTopic: "RAG retrieval quality",
    });

    await service.updateGraph("member:alice", session.id, {
      expectedVersion: 0,
      nodeOverrides: {
        topic: {
          position: { x: 120, y: 80 },
          pinned: true,
          hidden: false,
          label: "My RAG topic",
          note: "Compare recall and latency",
          updatedAt: "2026-08-24T12:00:00.000Z",
        },
      },
      hiddenSystemEdgeIds: ["system-edge"],
      personalEdges: [{
        id: "personal-1",
        source: "topic",
        target: "resource-1",
        type: "personal_note",
        label: "supports",
        note: "Use in methods section",
      }],
    });

    const restarted = new ResearchSessionService(store);
    const restored = await restarted.get("member:alice", session.id);
    expect(restored.personalGraph.version).toBe(1);
    expect(restored.personalGraph.nodeOverrides.topic.pinned).toBe(true);
    expect(restored.personalGraph.personalEdges[0].type).toBe("personal_note");
  });

  it("restores a saved search without the volatile interaction store", async () => {
    const { store, service } = fixture();
    const session = await service.create("member:alice", { researchQuestion: "Restart-safe explore" });
    await service.recordSearch("member:alice", session.id, {
      interactionId: "int-persisted",
      query: "Persistent deep link",
      at: "2026-08-24T12:00:00.000Z",
      concepts: [{ id: "rag", name: "RAG" }],
      resources: [{ id: "paper-1", title: "RAG Survey", concepts: [{ id: "rag", name: "RAG" }] }],
    });

    const restarted = new ResearchSessionService(store);
    await expect(restarted.getSearch("member:alice", session.id, "int-persisted")).resolves.toMatchObject({
      interactionId: "int-persisted",
      query: "Persistent deep link",
    });
    await expect(restarted.getSearch("member:bob", session.id, "int-persisted")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never reveals a session to another owner", async () => {
    const { service } = fixture();
    const session = await service.create("member:alice", { researchQuestion: "Private topic" });
    await expect(service.get("member:bob", session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.list("member:bob")).resolves.toEqual([]);
  });

  it("detects optimistic conflicts without overwriting newer edits", async () => {
    const { service } = fixture();
    const session = await service.create("guest:one", { researchQuestion: "Conflict recovery" });
    await service.updateGraph("guest:one", session.id, {
      expectedVersion: 0,
      nodeOverrides: {},
      hiddenSystemEdgeIds: [],
      personalEdges: [],
    });
    await expect(service.updateGraph("guest:one", session.id, {
      expectedVersion: 0,
      nodeOverrides: {},
      hiddenSystemEdgeIds: [],
      personalEdges: [],
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("projects upload and writing activity into the session graph source stream", async () => {
    const { service } = fixture();
    const session = await service.create("member:alice", { researchQuestion: "Activity projection" });
    await service.recordActivity("member:alice", session.id, { kind: "upload", title: "rag-notes.md", resourceId: "asset:1" });
    const updated = await service.recordActivity("member:alice", session.id, { kind: "writing", title: "文献综述 · RAG retrieval", resourceId: "artifact:1" });
    expect(updated.searches).toHaveLength(2);
    expect(updated.searches[0].resources[0]).toMatchObject({ id: "asset:1", sourceLabel: "私有知识库" });
    expect(updated.searches[1].resources[0]).toMatchObject({ id: "artifact:1", sourceLabel: "写作产物" });
    expect(updated.searches[1].concepts.length).toBeGreaterThan(0);
  });

});
