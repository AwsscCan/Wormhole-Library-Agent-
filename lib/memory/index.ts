/**
 * Memory Module — Public API
 *
 * Re-exports the frozen MemoryCompiler interface and its implementation.
 * The orchestrator should import from here, not from internal files.
 *
 * Package 03 implementation — NOT the fallback in fallbackEngine.ts.
 */

import type {
  Feedback,
  PaperCard,
  MemorySnapshot,
  MemoryPatch,
  MemoryHistoryEntry,
} from "../types";
import { compileFeedback } from "./compileFeedback";
import { applyPatch } from "./applyPatch";
import { rankWithMemory } from "./rankWithMemory";
import { renderMemoryContext, renderMemoryUsed } from "./renderMemoryContext";

// Re-export individual functions
export { compileFeedback } from "./compileFeedback";
export { applyPatch } from "./applyPatch";
export { rankWithMemory } from "./rankWithMemory";
export {
  renderMemoryContext,
  renderMemoryHistory,
  renderMemoryUsed,
} from "./renderMemoryContext";
export {
  getMemory,
  getMemoryHistory,
  resetMemory,
  getDefaultMemory,
  InMemoryStore,
  type MemoryStore,
} from "./getMemory";
export { FileStore, sharedStore } from "./fileStore";

// Re-export frozen types
export type { MemoryCompiler } from "../types";

/**
 * MemoryCompilerImpl — the REAL implementation of the MemoryCompiler interface.
 *
 * This is what the orchestrator should call instead of compileFeedbackFallback.
 *
 * It delegates to the individual function modules:
 * - compile() → compileFeedback.ts
 * - apply() → applyPatch.ts
 * - rank() → rankWithMemory.ts
 * - getContext() → renderMemoryContext.ts
 */
export class MemoryCompilerImpl {
  /**
   * Compile user feedback into structured memory patches.
   */
  compile(feedback: Feedback, paper?: PaperCard): MemoryPatch[] {
    return compileFeedback(feedback, paper);
  }

  /**
   * Apply patches to a memory snapshot, returning the updated snapshot.
   */
  apply(
    memory: MemorySnapshot,
    patches: MemoryPatch[]
  ): { memory: MemorySnapshot; history: MemoryHistoryEntry } {
    return applyPatch(memory, patches);
  }

  /**
   * Re-rank search results based on user memory.
   */
  rank(papers: PaperCard[], memory: MemorySnapshot): PaperCard[] {
    return rankWithMemory(papers, memory);
  }

  /**
   * Render a human-readable context string for LLM injection.
   */
  getContext(memory: MemorySnapshot, query: string): string {
    return renderMemoryContext(memory, query);
  }
}

/**
 * Default singleton instance.
 */
let _default: MemoryCompilerImpl | null = null;
export function getDefaultMemoryCompiler(): MemoryCompilerImpl {
  if (!_default) _default = new MemoryCompilerImpl();
  return _default;
}
