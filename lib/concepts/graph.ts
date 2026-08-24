/**
 * Concept Graph Module
 *
 * Implements the ConceptGraph interface.
 * Loads seed data and provides graph operations for wormhole pathfinding.
 *
 * Design doc 10.4: BridgeScore uses path_strength = average(edge.weight).
 * Design doc 24: 4 required concept chains must exist in seed data.
 */

import type {
  ConceptGraph,
  ConceptNode,
  ConceptEdge,
  ConceptTag,
} from "../types";
import seedConceptsData from "../../data/seed-concepts.json";
import seedEdgesData from "../../data/seed-edges.json";

export class ConceptGraphImpl implements ConceptGraph {
  nodes: Map<string, ConceptNode>;
  edges: ConceptEdge[];
  private adjacency: Map<string, { node: ConceptNode; edge: ConceptEdge }[]>;
  private reverseAdjacency: Map<string, { node: ConceptNode; edge: ConceptEdge }[]>;

  constructor(nodes: ConceptNode[], edges: ConceptEdge[]) {
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
    this.edges = edges;
    this.adjacency = new Map();
    this.reverseAdjacency = new Map();
    this.buildAdjacency();
  }

  private buildAdjacency(): void {
    for (const edge of this.edges) {
      const sourceNode = this.nodes.get(edge.source);
      const targetNode = this.nodes.get(edge.target);
      if (!sourceNode || !targetNode) continue;

      if (!this.adjacency.has(edge.source)) {
        this.adjacency.set(edge.source, []);
      }
      this.adjacency.get(edge.source)!.push({ node: targetNode, edge });

      // Undirected: also add reverse
      if (!this.reverseAdjacency.has(edge.target)) {
        this.reverseAdjacency.set(edge.target, []);
      }
      this.reverseAdjacency.get(edge.target)!.push({ node: sourceNode, edge });
    }
  }

  /**
   * Find a path between two concepts through the graph using BFS.
   * Returns the edges along the path, or empty array if no path found.
   */
  findPath(fromId: string, toId: string): ConceptEdge[] {
    if (fromId === toId) return [];
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return [];

    const queue: string[] = [fromId];
    const visited = new Set<string>([fromId]);
    const parent: Map<string, { node: string; edge: ConceptEdge } | null> = new Map();
    parent.set(fromId, null);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.getNeighbors(current);

      for (const { node, edge } of neighbors) {
        if (visited.has(node.id)) continue;
        visited.add(node.id);
        parent.set(node.id, { node: current, edge });

        if (node.id === toId) {
          // Reconstruct path
          const path: ConceptEdge[] = [];
          let cursor: string | null = toId;
          while (cursor && cursor !== fromId) {
            const p = parent.get(cursor);
            if (!p) break;
            path.unshift(p.edge);
            cursor = p.node;
          }
          return path;
        }

        queue.push(node.id);
      }
    }

    return []; // no path found
  }

  /**
   * Get all neighbors of a concept node (undirected).
   */
  getNeighbors(nodeId: string): { node: ConceptNode; edge: ConceptEdge }[] {
    const forward = this.adjacency.get(nodeId) ?? [];
    const reverse = this.reverseAdjacency.get(nodeId) ?? [];
    // Combine and deduplicate by target node id
    const seen = new Set<string>();
    const result: { node: ConceptNode; edge: ConceptEdge }[] = [];
    for (const entry of [...forward, ...reverse]) {
      if (!seen.has(entry.node.id)) {
        seen.add(entry.node.id);
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * Compute concept overlap (Jaccard similarity) between two concept sets.
   * Uses concept names for matching.
   */
  overlap(a: ConceptTag[], b: ConceptTag[]): number {
    const setA = new Set(a.map((c) => c.name));
    const setB = new Set(b.map((c) => c.name));
    const intersection = [...setA].filter((x) => setB.has(x));
    const union = new Set([...setA, ...setB]);
    if (union.size === 0) return 0;
    return intersection.length / union.size;
  }

  /**
   * Get the shortest path length between two concept nodes.
   */
  pathLength(fromId: string, toId: string): number {
    const path = this.findPath(fromId, toId);
    return path.length;
  }

  /**
   * Check if two concepts are directly connected (1-hop).
   */
  areDirectlyConnected(idA: string, idB: string): boolean {
    const neighbors = this.getNeighbors(idA);
    return neighbors.some((n) => n.node.id === idB);
  }
}

/**
 * Load the concept graph from seed data files.
 */
let _cachedGraph: ConceptGraphImpl | null = null;

export function loadConceptGraph(): ConceptGraphImpl {
  if (_cachedGraph) return _cachedGraph;
  // 兼容两种 seed 格式：pkg03 裸数组 / 主仓库 {concepts:[...]} 包装
  const conceptList = (
    Array.isArray(seedConceptsData)
      ? seedConceptsData
      : ((seedConceptsData as { concepts?: unknown[] }).concepts ?? [])
  ) as ConceptNode[];
  const edgeList = (
    Array.isArray(seedEdgesData)
      ? seedEdgesData
      : ((seedEdgesData as { edges?: unknown[] }).edges ?? [])
  ) as ConceptEdge[];
  // 兼容主仓库边字段名 fromConceptId/toConceptId → source/target
  const normalizedEdges: ConceptEdge[] = edgeList.map((e) => {
    const rec = e as unknown as Record<string, unknown>;
    return {
      ...e,
      source: (e.source as string) ?? (rec.fromConceptId as string),
      target: (e.target as string) ?? (rec.toConceptId as string),
    };
  });
  _cachedGraph = new ConceptGraphImpl(conceptList, normalizedEdges);
  return _cachedGraph;
}

/**
 * Validate that the 4 required concept chains exist in the graph.
 * Design doc 24: these chains are used for the wormhole demo.
 */
export function validateRequiredChains(graph: ConceptGraphImpl): boolean {
  const chains = [
    ["c_ai_agent", "c_multi_agent", "c_game_theory", "c_mechanism_design"],
    ["c_ai_agent", "c_agent_memory", "c_human_memory", "c_cognitive_psychology", "c_forgetting_curve"],
    ["c_transformer", "c_information_theory", "c_statistical_physics", "c_phase_transition"],
    ["c_rag", "c_information_retrieval", "c_library_science", "c_personal_km"],
  ];

  for (const chain of chains) {
    for (let i = 0; i < chain.length - 1; i++) {
      if (!graph.areDirectlyConnected(chain[i], chain[i + 1])) {
        console.error(`Chain broken: ${chain[i]} -> ${chain[i + 1]}`);
        return false;
      }
    }
  }
  return true;
}

/* ---------------- 责任书 3.2 公开入口 ---------------- */

/** 概念图路径（责任书 findConceptPaths 返回类型） */
export type ConceptPath = {
  startId: string;
  destinationId: string;
  edges: ConceptEdge[];
  pathLength: number;
  avgWeight: number;
};

/**
 * 责任书 3.2 公开入口：在概念图上寻找从多个起点到同一终点的路径。
 * 每个起点经 BFS（findPath）得到一条最短路径；无路径或超过 maxHops
 * 的起点被跳过。结果按传入起点顺序返回。
 */
export function findConceptPaths(
  startIds: string[],
  destinationId: string,
  options?: { graph?: ConceptGraphImpl; maxHops?: number }
): ConceptPath[] {
  const graph = options?.graph ?? loadConceptGraph();
  const maxHops = options?.maxHops ?? 6;
  const paths: ConceptPath[] = [];

  for (const startId of startIds) {
    if (startId === destinationId) continue;
    const edges = graph.findPath(startId, destinationId);
    if (edges.length === 0 || edges.length > maxHops) continue;
    paths.push({
      startId,
      destinationId,
      edges,
      pathLength: edges.length,
      avgWeight:
        edges.reduce((sum, e) => sum + (e.weight ?? 0.5), 0) / edges.length,
    });
  }
  return paths;
}
