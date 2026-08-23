/**
 * Concept Extraction Module
 *
 * Implements the ConceptExtractor interface.
 * Extracts meaningful concepts from papers and text using the concept graph.
 *
 * Design doc 10.2: filter concepts by level >= 1 and score > 0.3
 */

import type { ConceptTag, PaperCard, PaperConceptExtractor, ConceptGraph } from "../types";
import { ConceptGraphImpl, loadConceptGraph } from "./graph";

export class ConceptExtractorImpl implements PaperConceptExtractor {
  private graph: ConceptGraph | null = null;

  constructor(graph?: ConceptGraph) {
    this.graph = graph ?? null;
  }

  /**
   * Extract concepts from a paper's existing concept tags.
   * Filters out broad categories (level=0) and low-relevance tags (score <= 0.3).
   *
   * Per design doc 10.2: only level >= 1 and score > 0.3 are used for
   * novelty/bridge computation.
   */
  extract(paper: PaperCard): ConceptTag[] {
    if (!paper.concepts || paper.concepts.length === 0) return [];
    return paper.concepts.filter(
      (c) => c.level >= 1 && c.score > 0.3
    );
  }

  /**
   * Extract concepts from raw text using the concept graph.
   * Performs keyword matching against concept names and aliases.
   *
   * When the concept graph is not available, falls back to a simple
   * keyword-based extraction from the text itself.
   */
  extractFromText(text: string, graph?: ConceptGraph): ConceptTag[] {
    const g = graph ?? this.graph ?? loadConceptGraph();
    const lowerText = text.toLowerCase();
    const matched: ConceptTag[] = [];

    for (const [id, node] of g.nodes) {
      const candidates = [node.name, ...node.aliases];
      for (const candidate of candidates) {
        if (lowerText.includes(candidate.toLowerCase())) {
          matched.push({
            id: node.id,
            name: node.name,
            score: node.score,
            level: node.level,
          });
          break; // avoid duplicate matches for the same concept
        }
      }
    }

    // Sort by score descending, take top 15
    matched.sort((a, b) => b.score - a.score);
    return matched.slice(0, 15);
  }

  /**
   * Get the concept names as a Set for set operations.
   */
  toNameSet(concepts: ConceptTag[]): Set<string> {
    return new Set(concepts.map((c) => c.name));
  }

  /**
   * Get the concept IDs as a Set for graph operations.
   */
  toIdSet(concepts: ConceptTag[]): Set<string> {
    return new Set(concepts.map((c) => c.id));
  }
}

/**
 * Default singleton instance (lazy-loaded graph).
 */
let _default: ConceptExtractorImpl | null = null;
export function getDefaultConceptExtractor(): ConceptExtractorImpl {
  if (!_default) _default = new ConceptExtractorImpl();
  return _default;
}
