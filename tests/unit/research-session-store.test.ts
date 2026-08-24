import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileResearchSessionStore, ResearchSessionService } from "@/lib/research/sessionStore";

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "wormhole-research-"));
  const file = path.join(directory, "sessions.json");
  let sequence = 0;
  const store = new FileResearchSessionStore(file);
  const service = new ResearchSessionService(store, {
    now: () => "2026-08-24T12:00:00.000Z",
    id: (prefix) => `${prefix}-${++sequence}`,
  });
  return { file, service };
}

describe("ResearchSessionStore", () => {
  it("persists a session and restores the same private graph after restart", async () => {
    const { file, service } = fixture();
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

    const restarted = new ResearchSessionService(new FileResearchSessionStore(file));
    const restored = await restarted.get("member:alice", session.id);
    expect(restored.personalGraph.version).toBe(1);
    expect(restored.personalGraph.nodeOverrides.topic.pinned).toBe(true);
    expect(restored.personalGraph.personalEdges[0].type).toBe("personal_note");
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

  it("quarantines corrupt state and recovers an empty store", async () => {
    const { file, service } = fixture();
    await service.create("guest:one", { researchQuestion: "Before corruption" });
    writeFileSync(file, "{not-json", "utf8");

    const recovered = new ResearchSessionService(new FileResearchSessionStore(file));
    await expect(recovered.list("guest:one")).resolves.toEqual([]);
    expect(readFileSync(`${file}.corrupt`, "utf8")).toBe("{not-json");
  });
});
