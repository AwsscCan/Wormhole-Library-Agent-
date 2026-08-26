import type { SystemGraph } from "@/lib/research/types";
import type { WorkbenchResourceProjection } from "./types";

const resourceNodeId = (resourceId: string) => `resource:${encodeURIComponent(resourceId)}`;
const conceptNodeId = (conceptId: string) => `concept:${encodeURIComponent(conceptId)}`;
export const workbenchNoteId = (resourceId: string) => `workbench-note:${resourceId}`;
export function workbenchNoteHref(sessionId: string, resourceId: string, noteId = workbenchNoteId(resourceId)) {
  const session = encodeURIComponent(sessionId);
  const resource = encodeURIComponent(resourceId);
  const note = encodeURIComponent(noteId);
  return `/research/${session}/workbench?view=reading&resourceId=${resource}&noteId=${note}#${note}`;
}

export function projectWorkbenchResources(base: SystemGraph, projections: Record<string, WorkbenchResourceProjection>): SystemGraph {
  const nodes = [...base.nodes];
  const edges = [...base.edges];
  const known = new Set(nodes.map((node) => node.id));
  Object.values(projections).sort((a, b) => a.resourceId.localeCompare(b.resourceId)).forEach((projection, index) => {
    const nodeId = resourceNodeId(projection.resourceId);
    if (known.has(nodeId)) return;
    known.add(nodeId);
    nodes.push({ id: nodeId, label: projection.title, kind: "resource", resourceId: projection.resourceId, recommendationProjection: true,
      position: { x: 680 + (index % 4) * 190, y: -260 + Math.floor(index / 4) * 130 } });
    projection.conceptIds.map(conceptNodeId).filter((id) => known.has(id)).forEach((source) => {
      edges.push({ id: `system:concept_resource:${source}:${nodeId}`, source, target: nodeId,
        type: "concept_resource", system: true, recommendationProjection: true });
    });
  });
  return { nodes, edges };
}

export function resolveFocusedResource(graph: SystemGraph, resourceId?: string) {
  if (!resourceId) return { nodeId: null, status: "none" as const };
  const nodeId = resourceNodeId(resourceId);
  return graph.nodes.some((node) => node.id === nodeId)
    ? { nodeId, status: "focused" as const }
    : { nodeId: null, status: "unavailable" as const };
}

export function workbenchResourceLinks(sessionId: string, projection: WorkbenchResourceProjection) {
  const session = encodeURIComponent(sessionId);
  const resource = encodeURIComponent(projection.resourceId);
  return {
    map: `/research/${session}/map?sessionId=${session}&resourceId=${resource}`,
    workbench: `/research/${session}/workbench?resourceId=${resource}`,
    note: workbenchNoteHref(sessionId, projection.resourceId),
    draft: `/research/${session}/workbench?view=evidence&resourceId=${resource}`,
    catalog: projection.sourceUrl,
  };
}
