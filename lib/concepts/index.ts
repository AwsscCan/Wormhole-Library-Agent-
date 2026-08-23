/**
 * Concepts Module — Public API
 *
 * Re-exports the frozen ConceptExtractor interface and its implementation.
 * The orchestrator should import from here, not from internal files.
 */

export { ConceptExtractorImpl, getDefaultConceptExtractor } from "./conceptExtraction";
export { ConceptGraphImpl, loadConceptGraph, validateRequiredChains } from "./graph";
export {
  filterMeaningful,
  computeNovelty,
  computeNoveltyFit,
  computeOverlap,
  getUniqueConcepts,
  toConceptVector,
  conceptSimilarity,
} from "./vectors";

// Re-export frozen types for convenience
export type {
  PaperConceptExtractor,
  ConceptGraph,
  ConceptNode,
  ConceptEdge,
} from "../types";
