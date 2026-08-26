import { describe, expect, it } from "vitest";
import type { SystemGraph } from "@/lib/research/types";
import { projectWorkbenchResources, resolveFocusedResource, workbenchResourceLinks } from "@/lib/workbench/projection";
import type { WorkbenchResourceProjection } from "@/lib/workbench/types";

const base: SystemGraph = { nodes: [{ id: "topic", label: "Topic", kind: "topic", position: { x: 0, y: 0 } }], edges: [] };
const projection: WorkbenchResourceProjection = { resourceId: "paper/42", recommendationId: "rec-42", title: "Projected paper",
  conceptIds: ["concept-1"], conceptLabels: ["Concept One"], sourceLabel: "OpenAlex", sourceUrl: "https://example.test/paper/42",
  provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: "2026-08-25T00:00:00.000Z" }, projectedAt: "2026-08-25T00:00:00.000Z" };

describe("workbench resource deep-link projection", () => {
  it("projects a recommendation as a focusable private graph resource", () => {
    const graph = projectWorkbenchResources(base, { [projection.resourceId]: projection });
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "resource:paper%2F42", resourceId: "paper/42", label: "Projected paper",
      recommendationProjection: true }));
    expect(graph.edges).toEqual([]);
    expect(resolveFocusedResource(graph, "paper/42")).toEqual({ nodeId: "resource:paper%2F42", status: "focused" });
  });

  it("returns explicit recovery for a stale target and creates bidirectional entries", () => {
    expect(resolveFocusedResource(base, "missing")).toEqual({ nodeId: null, status: "unavailable" });
    const links = workbenchResourceLinks("session / 1", projection);
    expect(links.map).toContain("resourceId=paper%2F42");
    expect(links.workbench).toContain("resourceId=paper%2F42");
    expect(links.note).toContain("view=reading");
    expect(links.note).toContain("noteId=workbench-note%3Apaper%2F42");
    expect(links.draft).toContain("view=evidence");
    expect(links.catalog).toBe(projection.sourceUrl);
  });

  it("links a projected resource only to a real matching concept node", () => {
    const graph = projectWorkbenchResources({ nodes: [...base.nodes,
      { id: "concept:concept-1", label: "Concept One", kind: "concept", position: { x: 1, y: 1 } }], edges: [] },
    { [projection.resourceId]: projection });
    expect(graph.edges).toEqual([expect.objectContaining({ source: "concept:concept-1", target: "resource:paper%2F42", type: "concept_resource" })]);
  });
});
