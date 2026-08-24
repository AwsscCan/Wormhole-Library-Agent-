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
  FeedbackRequest,
  PaperCard,
  MemorySnapshot,
  MemoryPatch,
  MemoryHistoryEntry,
  MemoryCompiler,
  MemorySummary,
} from "../types";
import { compileFeedback } from "./compileFeedback";
import { applyPatch } from "./applyPatch";
import { rankWithMemory } from "./rankWithMemory";
import { renderMemoryContext } from "./renderMemoryContext";
import { toPaperFeedback, lookupPaperByTargetId } from "../wormhole/adapter";

// Re-export individual functions
export { compileFeedback, compileFeedbackMemory } from "./compileFeedback";
export { applyPatch, applyMemoryPatch } from "./applyPatch";
export { rankWithMemory, applyMemoryToRanking } from "./rankWithMemory";
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
  getUserMemory,
  saveSnapshot,
  InMemoryStore,
  type MemoryStore,
} from "./getMemory";
export { FileStore, sharedStore } from "./fileStore";

// Re-export frozen types
export type { PaperMemoryCompiler } from "../types";

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

/**
 * MemoryCompilerContract — 冻结契约 MemoryCompiler 的适配器实现
 * （03-01 / 03-02 补交）。
 *
 * 将 API 层 FeedbackRequest 全量（六种 rating，含 too_close / too_far /
 * not_relevant）映射为论文级 Feedback，交给正式 compileFeedback 编译；
 * 不再存在回退 compileFeedbackFallback 的路径。
 */
export class MemoryCompilerContract implements MemoryCompiler {
  async compileFeedback(
    input: FeedbackRequest,
    current: MemorySummary
  ): Promise<MemoryPatch[]> {
    void current; // 冻结签名占位：编译语义由 rating + 目标论文 + 自由文本决定
    const paperFeedback = toPaperFeedback(input);
    const paper = lookupPaperByTargetId(input.targetId);
    return compileFeedback(paperFeedback, paper);
  }
}

/**
 * Default singleton instance of the frozen-contract adapter.
 */
let _defaultContract: MemoryCompilerContract | null = null;
export function getDefaultMemoryCompilerContract(): MemoryCompilerContract {
  if (!_defaultContract) _defaultContract = new MemoryCompilerContract();
  return _defaultContract;
}

/**
 * 冻结契约函数形式：compileFeedback(input, current)
 * （03-01 补交，责任书要求的公开函数；与论文级同名函数以 FromRequest 后缀区分）。
 */
export function compileFeedbackFromRequest(
  input: FeedbackRequest,
  current: MemorySummary
): Promise<MemoryPatch[]> {
  return getDefaultMemoryCompilerContract().compileFeedback(input, current);
}
