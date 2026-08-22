/**
 * Wormhole Path Search Module
 *
 * Finds 2-3 hop citation paths from a start paper to candidate target papers.
 * Uses the references map (paperId -> list of referenced paper ids) to traverse
 * the citation graph.
 *
 * Design doc 10.4: path_strength = average(edge.weight for edge in path)
 * Design doc 10.4: path_explainability = 1 - ((path_length - 2)^2 / 4)
 *
 * Elimination rules (10.4):
 *   - bridge_score < 0.35 → discard
 *   - no paper endpoint → discard
 */

import type { PaperId, PaperCard, ConceptTag } from "../types";

/**
 * A candidate path through the citation graph.
 */
export type CitationPath = {
  papers: PaperId[];           // [start, hop1, hop2, ..., target]
  targetId: PaperId;
  targetPaper: PaperCard;
  hops: number;                // number of hops (papers.length - 1)
  edgeWeights: number[];       // weight of each edge in the path
};

/**
 * Find all citation paths from a start paper, up to maxHops deep.
 *
 * The references map provides: paperId -> [referenced paper ids]
 * (i.e., "which papers does this paper cite?")
 *
 * @param startPaperId - The paper to start from
 * @param papers - Map of all available papers
 * @param references - Map of paperId -> referenced paper ids
 * @param maxHops - Maximum path length (default 3)
 * @param maxPaths - Maximum number of candidate paths to return
 */
export function findCitationPaths(
  startPaperId: PaperId,
  papers: Map<PaperId, PaperCard>,
  references: Map<PaperId, PaperId[]>,
  maxHops: number = 3,
  maxPaths: number = 50
): CitationPath[] {
  const candidates: CitationPath[] = [];
  const visited = new Set<string>();

  function dfs(currentPath: PaperId[], depth: number): void {
    if (candidates.length >= maxPaths) return;
    if (depth > maxHops) return;

    const currentId = currentPath[currentPath.length - 1];
    const refs = references.get(currentId) ?? [];

    for (const refId of refs) {
      if (currentPath.includes(refId)) continue; // avoid cycles
      if (visited.has(refId) && depth > 1) continue;

      const refPaper = papers.get(refId);
      if (!refPaper) continue;

      const newPath = [...currentPath, refId];
      const pathKey = newPath.join("->");
      visited.add(pathKey);

      // 1 跳路径（start → ref）也作为候选：
      // OpenAlex 场景下 references map 通常只有起始论文一层数据，
      // 若要求 depth >= 1（至少 2 跳）则永远不会有候选。
      // "意外引用"（start 直接引用的跨领域论文）由 novelty 评分自然筛选。
      if (depth >= 0) {
        candidates.push({
          papers: newPath,
          targetId: refId,
          targetPaper: refPaper,
          hops: depth + 1,
          edgeWeights: newPath.slice(0, -1).map(() => 0.5), // default weight; refined later
        });
      }

      // Continue traversing
      dfs(newPath, depth + 1);
    }
  }

  dfs([startPaperId], 0);
  return candidates;
}

/**
 * Find paths through the concept graph between two papers' concept sets.
 * This is used as an alternative path-finding mechanism when citation
 * links are sparse.
 *
 * @param startConcepts - Concepts of the start paper
 * @param targetConcepts - Concepts of the target paper
 * @param conceptGraph - The concept graph to traverse
 * @returns Array of concept path edges (for bridge scoring)
 */
export function findConceptBridge(
  startConcepts: ConceptTag[],
  targetConcepts: ConceptTag[],
  findPathFn: (fromId: string, toId: string) => unknown[]
): { pathLength: number; avgWeight: number } {
  const filteredStart = startConcepts.filter((c) => c.level >= 1 && c.score > 0.3);
  const filteredTarget = targetConcepts.filter((c) => c.level >= 1 && c.score > 0.3);

  let bestLength = Infinity;
  let totalWeight = 0;
  let pathCount = 0;

  for (const sc of filteredStart) {
    for (const tc of filteredTarget) {
      if (sc.id === tc.id) {
        // Direct overlap — not a bridge, skip
        continue;
      }
      const path = findPathFn(sc.id, tc.id) as { weight: number }[];
      if (path && path.length > 0 && path.length < bestLength) {
        bestLength = path.length;
        totalWeight = path.reduce((sum, e) => sum + (e.weight ?? 0.5), 0);
        pathCount++;
      }
    }
  }

  if (pathCount === 0 || bestLength === Infinity) {
    return { pathLength: 0, avgWeight: 0.5 };
  }

  return {
    pathLength: bestLength,
    avgWeight: totalWeight / pathCount,
  };
}

/**
 * Deduplicate citation paths by target paper.
 * Keeps the shortest path to each target.
 */
export function deduplicateByTarget(paths: CitationPath[]): CitationPath[] {
  const byTarget = new Map<PaperId, CitationPath>();
  for (const path of paths) {
    const existing = byTarget.get(path.targetId);
    if (!existing || path.hops < existing.hops) {
      byTarget.set(path.targetId, path);
    }
  }
  return [...byTarget.values()];
}
