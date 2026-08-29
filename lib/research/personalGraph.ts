import { createHash } from "node:crypto";
import type {
  GraphActivity,
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

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1));
}

function overlap(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]).size;
  return union ? [...left].filter((value) => right.has(value)).length / union : 0;
}

function key(value: string): string {
  return [...words(value)].sort().join(" ") || value.trim().toLowerCase();
}

export type SearchActivity = GraphActivity;

/**
 * Measures a search against the concepts and terms already present in this
 * private session. The first search is intentionally near the topic; later
 * searches move out only when they introduce genuinely new context.
 */
export function deriveSearchActivity(session: ResearchSession): Map<string, SearchActivity> {
  const ordered = [...session.searches].sort((left, right) => left.at.localeCompare(right.at));
  const frequencies = new Map<string, number>();
  for (const search of ordered) frequencies.set(key(search.query), (frequencies.get(key(search.query)) ?? 0) + 1);
  const maxFrequency = Math.max(1, ...frequencies.values());
  const knownConcepts = new Set<string>();
  let knownTerms = words(session.writingTopic ?? session.researchQuestion);
  const activity = new Map<string, SearchActivity>();
  for (const search of ordered) {
    const concepts = new Set(search.concepts.map((concept) => concept.id));
    const conceptOverlap = concepts.size && knownConcepts.size ? overlap(concepts, knownConcepts) : 0;
    const termOverlap = overlap(words(search.query), knownTerms);
    const novelty = knownConcepts.size === 0 && knownTerms.size > 0
      ? 0.12
      : Math.max(0.08, Math.min(1, 1 - (concepts.size ? conceptOverlap * 0.7 + termOverlap * 0.3 : termOverlap)));
    const frequency = frequencies.get(key(search.query)) ?? 1;
    activity.set(search.interactionId, { novelty, searchFrequency: frequency, brightness: 0.35 + 0.65 * (frequency / maxFrequency) });
    search.concepts.forEach((concept) => knownConcepts.add(concept.id));
    knownTerms = new Set([...knownTerms, ...words(search.query)]);
  }
  return activity;
}

function visualActivity(frequency: number, maximum: number, novelty: number): GraphActivity {
  return { searchFrequency: frequency, novelty, brightness: 0.35 + 0.65 * (frequency / Math.max(1, maximum)) };
}

export function buildSystemGraph(session: ResearchSession): SystemGraph {
  const nodes: SystemGraphNode[] = [{ id: "topic", label: session.writingTopic ?? session.researchQuestion, kind: "topic", position: { x: 0, y: 0 } }];
  const edges: SystemGraph["edges"] = [];
  const seen = new Set(["topic"]);
  const searchActivity = deriveSearchActivity(session);
  const conceptFrequency = new Map<string, number>();
  const resourceFrequency = new Map<string, number>();
  for (const search of session.searches) {
    search.concepts.forEach((concept) => conceptFrequency.set(concept.id, (conceptFrequency.get(concept.id) ?? 0) + 1));
    search.resources.forEach((resource) => resourceFrequency.set(resource.id, (resourceFrequency.get(resource.id) ?? 0) + 1));
  }
  const maxConceptFrequency = Math.max(1, ...conceptFrequency.values());
  const maxResourceFrequency = Math.max(1, ...resourceFrequency.values());
  const addNode = (node: SystemGraphNode) => { if (!seen.has(node.id)) { seen.add(node.id); nodes.push(node); } };
  const addEdge = (source: string, target: string, type: SystemGraph["edges"][number]["type"]) => {
    const id = `system:${type}:${source}:${target}`;
    if (!edges.some((edge) => edge.id === id)) edges.push({ id, source, target, type, system: true });
  };

  session.searches.slice(-8).forEach((search, searchIndex) => {
    const activity = searchActivity.get(search.interactionId) ?? { novelty: 0.12, searchFrequency: 1, brightness: 0.35 };
    const searchId = `search:${idPart(search.interactionId)}`;
    addNode({ id: searchId, label: search.query, kind: "search", position: position(searchIndex, 180 + activity.novelty * 420, -0.4), activity });
    addEdge("topic", searchId, "topic_search");
    search.concepts.forEach((concept, conceptIndex) => {
      const conceptId = `concept:${idPart(concept.id)}`;
      const conceptActivity = visualActivity(conceptFrequency.get(concept.id) ?? 1, maxConceptFrequency, activity.novelty);
      addNode({ id: conceptId, label: concept.name, kind: "concept", position: position(conceptIndex + searchIndex, 280 + activity.novelty * 430, 0.2), activity: conceptActivity });
      addEdge(searchId, conceptId, "search_concept");
      search.resources.forEach((resource, resourceIndex) => {
        if (!resource.concepts.some((item) => item.id === concept.id)) return;
        const resourceId = `resource:${idPart(resource.id)}`;
        const resourceActivity = visualActivity(resourceFrequency.get(resource.id) ?? 1, maxResourceFrequency, activity.novelty);
        addNode({ id: resourceId, label: resource.title, kind: "resource", resourceId: resource.id, position: position(resourceIndex + conceptIndex, 420 + activity.novelty * 500, 0.6), activity: resourceActivity });
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
