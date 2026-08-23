/**
 * Wormhole Generation Module
 *
 * Implements the WormholeEngine interface.
 * Generates knowledge wormholes: citation paths from a start paper
 * to conceptually different but bridged target papers.
 *
 * The slider controls novelty target — how far from the start paper's
 * domain the wormhole should jump.
 *
 * Design doc 4.5: wormhole = citation 2-3 hops + concept difference
 * Design doc 10: full scoring pipeline
 */

import type {
  PaperId,
  PaperCard,
  ConceptTag,
  PaperWormholeCard,
  MemorySnapshot,
  ConceptGraph,
  PaperWormholeEngine,
} from "../types";
import { ConceptExtractorImpl } from "../concepts/conceptExtraction";
import { loadConceptGraph } from "../concepts/graph";
import {
  findCitationPaths,
  deduplicateByTarget,
  type CitationPath,
} from "./paths";
import {
  scoreNovelty,
  scoreNoveltyFit,
  scoreBridge,
  scoreQuality,
  scoreFinal,
  applyMemoryCorrection,
  computeDiversity,
  shouldEliminate,
} from "./score";

export class WormholeEngineImpl implements PaperWormholeEngine {
  private extractor: ConceptExtractorImpl;

  constructor(extractor?: ConceptExtractorImpl) {
    this.extractor = extractor ?? new ConceptExtractorImpl();
  }

  generate(params: {
    startPaperId: PaperId;
    sliderValue: number;
    maxPaths?: number;
    papers: Map<PaperId, PaperCard>;
    references: Map<PaperId, PaperId[]>;
    concepts: Map<PaperId, ConceptTag[]>;
    memory?: MemorySnapshot;
    conceptGraph?: ConceptGraph;
  }): PaperWormholeCard[] {
    const {
      startPaperId,
      sliderValue,
      maxPaths = 3,
      papers,
      references,
      memory,
      conceptGraph,
    } = params;

    const graph = conceptGraph ?? loadConceptGraph();
    const startPaper = papers.get(startPaperId);
    if (!startPaper) return [];

    const startConcepts = this.extractor.extract(startPaper);

    // Find citation paths up to 3 hops
    let candidates = findCitationPaths(
      startPaperId,
      papers,
      references,
      3,
      100
    );

    // Deduplicate: keep shortest path to each target
    candidates = deduplicateByTarget(candidates);

    // Find max cited-by for quality normalization
    const maxCitedBy = Math.max(
      ...candidates.map((c) => c.targetPaper.citedByCount),
      1
    );

    // Score each candidate
    const scored: Array<{
      path: CitationPath;
      novelty: number;
      noveltyFit: number;
      bridge: number;
      quality: number;
      diversity: number;
      final: number;
    }> = [];

    const selectedTargets: ConceptTag[][] = [];

    for (const candidate of candidates) {
      // Skip if target is the same as start
      if (candidate.targetId === startPaperId) continue;

      const targetConcepts = this.extractor.extract(candidate.targetPaper);

      // Compute scores
      const novelty = scoreNovelty(startConcepts, targetConcepts);
      const noveltyFit = scoreNoveltyFit(novelty, sliderValue);
      const bridge = scoreBridge(candidate.edgeWeights, candidate.hops);
      const quality = scoreQuality(
        candidate.targetPaper,
        maxCitedBy,
        memory
      );
      const diversity = computeDiversity(targetConcepts, selectedTargets);

      // Check elimination
      const { eliminate } = shouldEliminate(
        bridge,
        true, // has paper (we only iterate papers that exist)
        novelty
      );
      if (eliminate) continue;

      // Compute final score
      let finalScore = scoreFinal(bridge, noveltyFit, quality, diversity);

      // Apply memory corrections
      finalScore = applyMemoryCorrection(
        finalScore,
        candidate.targetPaper,
        memory
      );

      scored.push({
        path: candidate,
        novelty,
        noveltyFit,
        bridge,
        quality,
        diversity,
        final: finalScore,
      });

      selectedTargets.push(targetConcepts);
    }

    // Sort by final score descending
    scored.sort((a, b) => b.final - a.final);

    // Take top N
    const top = scored.slice(0, maxPaths);

    // Build WormholeCard objects
    return top.map((s, idx) => {
      const targetConcepts = this.extractor.extract(s.path.targetPaper);
      const uniqueConcepts = targetConcepts
        .filter(
          (tc) => !startConcepts.some((sc) => sc.name === tc.name)
        )
        .slice(0, 5);

      return {
        id: `wh_${Date.now()}_${idx}`,
        path: s.path.papers,
        startConcepts: startConcepts.slice(0, 5),
        targetConcepts: uniqueConcepts,
        targetPaper: s.path.targetPaper,
        explanation: this.generateExplanation(
          s.path.targetPaper,
          s.path.papers,
          startConcepts,
          uniqueConcepts,
          graph
        ),
        scores: {
          novelty: Math.round(s.novelty * 100) / 100,
          bridge: Math.round(s.bridge * 100) / 100,
          quality: Math.round(s.quality * 100) / 100,
          final: Math.round(s.final * 100) / 100,
        },
      };
    });
  }

  /**
   * Generate a human-readable explanation for why this wormhole exists.
   *
   * Format: "From [domain A], [intermediate concept] studies [related topic],
   * which bridges to [domain B] where [target paper] is influential."
   */
  private generateExplanation(
    targetPaper: PaperCard,
    path: PaperId[],
    startConcepts: ConceptTag[],
    targetConcepts: ConceptTag[],
    graph: ConceptGraph
  ): string {
    const startDomain =
      startConcepts.find((c) => c.level <= 1)?.name ?? "this field";
    const targetDomain =
      targetConcepts.find((c) => c.level <= 1)?.name ?? "another field";

    // Try to find a bridging concept through the concept graph
    let bridgeConcept = "";
    for (const sc of startConcepts) {
      for (const tc of targetConcepts) {
        if (sc.id === tc.id) continue;
        const pathEdges = graph.findPath(sc.id, tc.id);
        if (pathEdges.length > 0 && pathEdges.length <= 3) {
          bridgeConcept = sc.name;
          break;
        }
      }
      if (bridgeConcept) break;
    }

    const uniqueNames = targetConcepts.map((c) => c.name).slice(0, 3);
    const uniqueStr =
      uniqueNames.length > 0
        ? `involves ${uniqueNames.join(", ")}`
        : "covers different concepts";

    if (bridgeConcept) {
      return `From ${startDomain}, ${bridgeConcept} bridges to ${targetDomain}, where "${targetPaper.title}" ${uniqueStr}. The citation path spans ${path.length} papers.`;
    }

    return `From ${startDomain}, the citation chain leads to ${targetDomain}, where "${targetPaper.title}" ${uniqueStr}. This wormhole connects two fields that rarely cite each other directly.`;
  }
}

/**
 * Default singleton instance.
 */
let _default: WormholeEngineImpl | null = null;
export function getDefaultWormholeEngine(): WormholeEngineImpl {
  if (!_default) _default = new WormholeEngineImpl();
  return _default;
}
