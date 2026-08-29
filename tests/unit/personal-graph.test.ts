import { describe, expect, it } from "vitest";
import {
  buildSystemGraph,
  createNodeAction,
  deriveSearchActivity,
  hashPublicGraph,
  mergePersonalGraph,
} from "@/lib/research/personalGraph";
import type { ResearchSession } from "@/lib/research/types";

const session: ResearchSession = {
  id: "session-1",
  ownerId: "member:alice",
  researchQuestion: "Retrieval augmented generation",
  writingTopic: "RAG evaluation",
  interactionIds: ["int-1"],
  evidenceIds: ["resource-1", "resource-2"],
  searches: [{
    interactionId: "int-1",
    query: "hybrid retrieval",
    at: "2026-08-24T12:00:00.000Z",
    concepts: [{ id: "concept-rag", name: "RAG" }],
    resources: [
      { id: "resource-1", title: "Dense Retrieval", concepts: [{ id: "concept-rag", name: "RAG" }] },
      { id: "resource-2", title: "Sparse Retrieval", concepts: [{ id: "concept-rag", name: "RAG" }] },
    ],
  }],
  wormholes: [{ id: "wormhole-1", label: "Knowledge graphs", conceptIds: ["concept-kg"] }],
  personalGraph: { schemaVersion: 1, version: 0, nodeOverrides: {}, hiddenSystemEdgeIds: [], personalEdges: [] },
  revision: 0,
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z",
};

describe("personal topic graph", () => {
  it("builds topic, recent search, evidence and wormhole nodes", () => {
    const graph = buildSystemGraph(session);
    expect(new Set(graph.nodes.map((node) => node.kind))).toEqual(
      new Set(["topic", "search", "concept", "resource", "wormhole"]),
    );
  });

  it("merges private edits without mutating the public system layer", () => {
    const system = buildSystemGraph(session);
    const before = hashPublicGraph(system);
    const merged = mergePersonalGraph(system, {
      schemaVersion: 1,
      version: 1,
      nodeOverrides: {
        "concept:concept-rag": {
          position: { x: 22, y: 44 }, pinned: true, hidden: false,
          label: "My retrieval focus", note: "Investigate failure cases", updatedAt: session.updatedAt,
        },
      },
      hiddenSystemEdgeIds: [system.edges[0].id],
      personalEdges: [{ id: "mine", source: "topic", target: "concept:concept-rag", type: "personal_note" }],
    });

    expect(merged.nodes.find((node) => node.id === "concept:concept-rag")).toMatchObject({
      label: "My retrieval focus", pinned: true, note: "Investigate failure cases",
    });
    expect(merged.edges.some((edge) => edge.id === "mine")).toBe(true);
    expect(hashPublicGraph(system)).toBe(before);
  });

  it("creates explicit search and library actions that preserve sessionId", () => {
    expect(createNodeAction("search", session.id, "RAG")).toEqual({
      action: "search", sessionId: "session-1", topic: "RAG",
    });
    expect(createNodeAction("library", session.id, "RAG")).toEqual({
      action: "library", sessionId: "session-1", topic: "RAG",
    });
  });

  it("puts a novel search farther from the topic and makes repeated knowledge brighter", () => {
    const activitySession: ResearchSession = {
      ...session,
      searches: [
        session.searches[0],
        { interactionId: "int-2", query: "hybrid retrieval", at: "2026-08-25T12:00:00.000Z", concepts: [{ id: "concept-rag", name: "RAG" }], resources: [] },
        { interactionId: "int-3", query: "mechanism design incentives", at: "2026-08-26T12:00:00.000Z", concepts: [{ id: "concept-game", name: "Game theory" }], resources: [] },
      ],
    };
    const activity = deriveSearchActivity(activitySession);
    expect(activity.get("int-3")!.novelty).toBeGreaterThan(activity.get("int-2")!.novelty);
    expect(activity.get("int-2")!.brightness).toBeGreaterThan(activity.get("int-3")!.brightness);

    const graph = buildSystemGraph(activitySession);
    const repeated = graph.nodes.find((node) => node.id === "search:int-2")!;
    const novel = graph.nodes.find((node) => node.id === "search:int-3")!;
    expect(Math.hypot(novel.position.x, novel.position.y)).toBeGreaterThan(Math.hypot(repeated.position.x, repeated.position.y));
    expect(repeated.activity?.brightness).toBeGreaterThan(novel.activity?.brightness ?? 0);
  });
});
