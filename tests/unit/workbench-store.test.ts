import { describe, expect, it } from "vitest";
import { InMemoryResearchSessionStore, ResearchSessionService } from "@/lib/research/sessionStore";
import { InMemoryWorkbenchStore, WorkbenchService } from "@/lib/workbench/store";
import { projectWorkbenchResources, resolveFocusedResource } from "@/lib/workbench/projection";

async function fixture() {
  let id = 0;
  const research = new ResearchSessionService(new InMemoryResearchSessionStore(), {
    now: () => "2026-08-25T00:00:00.000Z", id: (prefix) => `${prefix}-${++id}`,
  });
  const store = new InMemoryWorkbenchStore();
  const service = new WorkbenchService(store, research, { now: () => "2026-08-25T00:00:00.000Z" });
  const session = await research.create("member:alice", { researchQuestion: "How should RAG evidence be evaluated?" });
  return { research, store, service, session };
}

describe("owner-scoped exploration workbench", () => {
  it("restores reading plan and all three user views after service restart", async () => {
    const { research, store, service, session } = await fixture();
    const initial = await service.get("member:alice", session.id);
    await service.update("member:alice", session.id, {
      expectedVersion: initial.version,
      surpriseLevel: "high",
      readingPlan: { goal: "Compare evidence standards", orderedResourceIds: ["r1"], estimatedMinutes: 30,
        completionDefinition: "A claim matrix is complete", nextAction: "Draft the limitations paragraph", completedResourceIds: [] },
      views: {
        reading: { nodePositions: { r1: { x: 1, y: 2 } }, hiddenNodeIds: [], personalEdges: [] },
        concept: { nodePositions: {}, hiddenNodeIds: [], personalEdges: [{ id: "p1", source: "c1", target: "c2", label: "my bridge" }] },
        evidence: { nodePositions: {}, hiddenNodeIds: ["e2"], personalEdges: [] },
      },
      resourceStates: { r1: { status: "reading", tags: ["methods"], note: "Check sample size" } },
      evidenceGraph: { claims: [], evidence: [], links: [], draftParagraphs: [] },
    });
    const restarted = new WorkbenchService(store, research);
    const restored = await restarted.get("member:alice", session.id);
    expect(restored.readingPlan.nextAction).toBe("Draft the limitations paragraph");
    expect(restored.views.concept.personalEdges[0].label).toBe("my bridge");
    expect(restored.resourceStates.r1.tags).toEqual(["methods"]);
  });

  it("prevents cross-owner read and write and detects optimistic conflicts", async () => {
    const { service, session } = await fixture();
    const state = await service.get("member:alice", session.id);
    await expect(service.get("member:bob", session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.update("member:bob", session.id, { ...state, expectedVersion: state.version })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.update("member:alice", session.id, { ...state, expectedVersion: state.version });
    await expect(service.update("member:alice", session.id, { ...state, expectedVersion: state.version })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("never mutates the session public/system graph while editing the user layer", async () => {
    const { research, service, session } = await fixture();
    const graphBefore = JSON.stringify((await research.get("member:alice", session.id)).personalGraph);
    const state = await service.get("member:alice", session.id);
    await service.update("member:alice", session.id, { ...state, expectedVersion: state.version,
      views: { ...state.views, concept: { ...state.views.concept, personalEdges: [{ id: "mine", source: "a", target: "b", label: "private" }] } } });
    expect(JSON.stringify((await research.get("member:alice", session.id)).personalGraph)).toBe(graphBefore);
  });

  it("persists a recommendation projection that the graph can actually focus after restart", async () => {
    const { research, store, service, session } = await fixture();
    await service.projectResources("member:alice", session.id, [{ resourceId: "paper/42", recommendationId: "rec-42",
      title: "Projected paper", conceptIds: ["c1"], conceptLabels: ["Concept"], sourceLabel: "OpenAlex",
      provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-25T00:00:00.000Z" }, projectedAt: "2026-08-25T00:00:00.000Z" }]);
    const restarted = new WorkbenchService(store, research);
    const restored = await restarted.get("member:alice", session.id);
    const graph = projectWorkbenchResources({ nodes: [{ id: "topic", label: "Topic", kind: "topic", position: { x: 0, y: 0 } }], edges: [] }, restored.resourceProjections);
    expect(resolveFocusedResource(graph, "paper/42")).toEqual({ nodeId: "resource:paper%2F42", status: "focused" });
  });
});
