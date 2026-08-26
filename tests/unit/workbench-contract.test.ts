import { afterEach, describe, expect, it } from "vitest";
import { GET as getWorkbench } from "@/app/api/research/sessions/[sessionId]/workbench/route";
import { clearCurrentPrincipalPortForTests } from "@/lib/research/principal";
import type { ResearchSession, SourceTransparentResource } from "@/lib/research/types";
import { feedbackSchema, recommendationRequestSchema, workbenchUpdateSchema } from "@/lib/workbench/schemas";
import { buildRecommendationResult } from "@/lib/workbench/runtime";
import { buildWorkbenchViewModel, paginateWorkbenchItems } from "@/lib/workbench/viewModel";
import type { WorkbenchState } from "@/lib/workbench/types";

afterEach(() => clearCurrentPrincipalPortForTests());

const session: ResearchSession = {
  id: "session-1", ownerId: "member:alice", researchQuestion: "How should evidence be evaluated?",
  interactionIds: [], evidenceIds: [], searches: [{ interactionId: "i1", query: "evidence", at: "2026-08-25T00:00:00.000Z",
    concepts: [{ id: "evidence", name: "Evidence" }], resources: [] }], wormholes: [],
  personalGraph: { schemaVersion: 1, version: 0, nodeOverrides: {}, hiddenSystemEdgeIds: [], personalEdges: [] },
  revision: 0, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
};

function state(): WorkbenchState {
  return { schemaVersion: 1, sessionId: session.id, ownerId: session.ownerId, version: 0, surpriseLevel: "medium",
    readingPlan: { goal: session.researchQuestion, orderedResourceIds: [], estimatedMinutes: 0, completionDefinition: "Done", nextAction: "Read", completedResourceIds: [] },
    views: { reading: { nodePositions: {}, hiddenNodeIds: [], personalEdges: [] }, concept: { nodePositions: {}, hiddenNodeIds: [], personalEdges: [] }, evidence: { nodePositions: {}, hiddenNodeIds: [], personalEdges: [] } },
    resourceStates: {}, resourceProjections: {}, evidenceGraph: { claims: [], evidence: [], links: [], draftParagraphs: [] },
    createdAt: session.createdAt, updatedAt: session.updatedAt };
}

describe("workbench API and UI contracts", () => {
  it("strictly rejects client identity fields", () => {
    const current = state();
    const input = { expectedVersion: 0, surpriseLevel: current.surpriseLevel, readingPlan: current.readingPlan,
      views: current.views, resourceStates: current.resourceStates, evidenceGraph: current.evidenceGraph };
    expect(workbenchUpdateSchema.safeParse({ ...input, ownerId: "member:bob" }).success).toBe(false);
    expect(recommendationRequestSchema.safeParse({ surpriseLevel: "low", userId: "bob" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ recommendationId: "r1", feedback: "useful", ownerId: "bob" }).success).toBe(false);
  });

  it("does not impose a total bibliography limit in the state contract", () => {
    const current = state();
    const ids = Array.from({ length: 10_001 }, (_, index) => `resource-${index}`);
    const parsed = workbenchUpdateSchema.safeParse({ expectedVersion: 0, surpriseLevel: current.surpriseLevel,
      readingPlan: { ...current.readingPlan, orderedResourceIds: ids }, views: current.views,
      resourceStates: current.resourceStates, evidenceGraph: { ...current.evidenceGraph,
        evidence: ids.map((resourceId) => ({ id: `e-${resourceId}`, resourceId, label: resourceId })) } });
    expect(parsed.success).toBe(true);
  });

  it("renders a bounded page without imposing a total collection limit", () => {
    const items = Array.from({ length: 10_001 }, (_, index) => `resource-${index}`);
    expect(paginateWorkbenchItems(items, 0, 25)).toEqual({ items: items.slice(0, 25), page: 0, pageCount: 401, total: 10_001 });
    expect(paginateWorkbenchItems(items, 999, 25)).toEqual({ items: items.slice(10_000), page: 400, pageCount: 401, total: 10_001 });
  });

  it("marks unauthenticated private responses no-store", async () => {
    const response = await getWorkbench(new Request("http://local/workbench"), { params: Promise.resolve({ sessionId: "private" }) });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("preserves provenance and explicit no-memory degradation", () => {
    const resources: SourceTransparentResource[] = Array.from({ length: 20 }, (_, index) => ({
      id: `r${index}`, type: "paper", title: `Paper ${index}`, authors: [], language: "en", why: "Relevant comparison",
      availability: "online", difficulty: "research", concepts: [{ id: `c${index}`, name: `Concept ${index}` }], qualityScore: 0.9,
      provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-25T00:00:00.000Z" },
    }));
    const result = buildRecommendationResult(session, { resources, sourceStatus: "live", degraded: false },
      { status: "unavailable", snippets: [], preferences: [], message: "Package 04 MemoryReadPort is not integrated" }, { surpriseLevel: "medium", limit: 10 });
    expect(result.source.labels).toEqual(["OpenAlex"]);
    expect(result.memory.status).toBe("unavailable");
    expect(result.recommendations.every((item) => item.provenance.sourceLabel === "OpenAlex")).toBe(true);
  });

  it("exposes all three views and session-preserving resource jumps", () => {
    const vm = buildWorkbenchViewModel(state(), []);
    expect(vm.tabs.map((tab) => tab.id)).toEqual(["reading", "concept", "evidence"]);
    const withResource = buildWorkbenchViewModel(state(), [{
      id: "rec", resourceId: "paper/1", title: "Paper", band: "direct", relevance: 1, trust: 1, accessible: true,
      conceptIds: [], citationIds: [], difficulty: "research", estimatedMinutes: 30,
      provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: session.createdAt },
      explanation: { relationship: "relationship reason", bridge: "bridge reason", difficulty: "difficulty reason", newValue: "new value reason" }, mmrScore: 1,
    }]);
    expect(withResource.resources[0].href).toContain("sessionId=session-1");
    expect(withResource.resources[0].href).toContain("resourceId=paper%2F1");
  });
});
