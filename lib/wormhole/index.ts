/**
 * Wormhole Module — Public API
 *
 * Re-exports the frozen WormholeEngine interface and its implementation.
 * The orchestrator should import from here, not from internal files.
 */

export { WormholeEngineImpl, getDefaultWormholeEngine } from "./generate";
export {
  findCitationPaths,
  deduplicateByTarget,
  findConceptBridge,
  type CitationPath,
} from "./paths";
export {
  scoreNovelty,
  scoreNoveltyFit,
  scoreBridge,
  scoreQuality,
  scoreFinal,
  applyMemoryCorrection,
  computeDiversity,
  shouldEliminate,
} from "./score";

// Re-export frozen types for convenience
export type { WormholeEngine, WormholeCard } from "../types";
