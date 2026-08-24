import { createHash } from "node:crypto";
import type {
  MergedGraph,
  PersonalGraphState,
  ResearchSession,
  SystemGraph,
  SystemGraphNode,
} from "./types";

function idPart(value: string): string {
  return encodeURIComponent(value);
}

function position(index: number, radius: number, offset = 0) {
  const angle = offset + index * 1.41;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

export function buildSystemGraph(session: ResearchSession): SystemGraph {
  const nodes: SystemGraphNode[] = [{ id: "topic", label: session.writingTopic ?? session.researchQuestion, kind: "topic", position: { x: 0, y: 0 } }];
  const edges: SystemGraph["edges"] = [];
  const seen = new Set(["topic"]);
  const addNode = (node: SystemGraphNode) => { if (!seen.has(node.id)) { seen.add(node.id); nodes.push(node); } };
  const addEdge = (source: string, target: string, type: SystemGraph["edges"][number]["type"]) => {
    const id = `system:${type}:${source}:${target}`;
    if (!edges.some((edge) => edge.id === id)) edges.push({ id, source, target, type, system: true });
  };

  session.searches.slice(-8).forEach((search, searchIndex) => {
    const searchId = `search:${idPart(search.interactionId)}`;
    addNode({ id: searchId, label: search.query, kind: "search", position: position(searchIndex, 230, -0.4) });
    addEdge("topic", searchId, "topic_search");
    search.concepts.forEach((concept, conceptIndex) => {
      const conceptId = `concept:${idPart(concept.id)}`;
      addNode({ id: conceptId, label: concept.name, kind: "concept", position: position(conceptIndex + searchIndex, 420, 0.2) });
      addEdge(searchId, conceptId, "search_concept");
      search.resources.forEach((resource, resourceIndex) => {
        if (!resource.concepts.some((item) => item.id === concept.id)) return;
        const resourceId = `resource:${idPart(resource.id)}`;
        addNode({ id: resourceId, label: resource.title, kind: "resource", resourceId: resource.id, position: position(resourceIndex + conceptIndex, 620, 0.6) });
        addEdge(conceptId, resourceId, "concept_resource");
      });
    });
  });

  session.wormholes.forEach((wormhole, index) => {
    const nodeId = `wormhole:${idPart(wormhole.id)}`;
    addNode({ id: nodeId, label: wormhole.label, kind: "wormhole", position: position(index, 520, 2.2) });
    addEdge("topic", nodeId, "wormhole");
  });
  return { nodes, edges };
}

export function mergePersonalGraph(system: SystemGraph, personal: PersonalGraphState): MergedGraph {
  const validNodeIds = new Set(system.nodes.map((node) => node.id));
  const hiddenEdges = new Set(personal.hiddenSystemEdgeIds);
  const nodes = system.nodes.map((node) => {
    const override = personal.nodeOverrides[node.id];
    return {
      ...node,
      label: override?.label ?? node.label,
      position: override?.position ?? node.position,
      pinned: override?.pinned ?? false,
      hidden: override?.hidden ?? false,
      note: override?.note,
      system: true as const,
    };
  });
  const personalEdges = personal.personalEdges.filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target));
  return { nodes, edges: [...system.edges.filter((edge) => !hiddenEdges.has(edge.id)), ...personalEdges] };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashPublicGraph(graph: SystemGraph): string {
  return createHash("sha256").update(stable(graph)).digest("hex");
}

export function createNodeAction(action: "search" | "library", sessionId: string, topic: string) {
  return { action, sessionId, topic } as const;
}
