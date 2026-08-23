/**
 * Wormhole Module — Public API
 *
 * Re-exports the frozen WormholeEngine interface and its implementation.
 * The orchestrator should import from here, not from internal files.
 *
 * 03-01 补交：新增冻结契约 WormholeEngine 的适配器实现
 * WormholeEngineContract / generateWormholes()，编排层与外部调用方
 * 应通过它们（而非论文级内部类）使用虫洞生成能力。
 */

import type { MemorySummary, WormholeCard, WormholeEngine } from "../types";
import { WormholeEngineImpl } from "./generate";
import { toMemorySnapshot, toUiWormholeCards } from "./adapter";
import { loadPaperLibrary, pickStartPaperId } from "../paperLibrary";

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
export type { PaperWormholeEngine, PaperWormholeCard } from "../types";

/**
 * WormholeEngineContract — 冻结契约 WormholeEngine 的适配器实现（03-01 补交）。
 *
 * 将论文级 WormholeEngineImpl.generate(...) 适配为冻结签名
 * generateWormholes({ userId, startConceptIds, sliderValue, maxPaths, memory })：
 * 起点概念 → 论文库起点论文 → 引用图路径搜索 + 概念差异度打分 → UI 虫洞卡。
 * 起点概念在论文库中无匹配论文时返回空数组（是否 fallback 由调用方决定）。
 */
export class WormholeEngineContract implements WormholeEngine {
  private engine: WormholeEngineImpl;

  constructor(engine?: WormholeEngineImpl) {
    this.engine = engine ?? new WormholeEngineImpl();
  }

  async generateWormholes(input: {
    userId: string;
    startConceptIds: string[];
    sliderValue: number;
    maxPaths: number;
    memory: MemorySummary;
  }): Promise<WormholeCard[]> {
    void input.userId; // 冻结签名占位：当前生成不按用户区分
    const paperLib = loadPaperLibrary();
    const startPaperId = pickStartPaperId(input.startConceptIds);
    if (!startPaperId) return [];
    const engineCards = this.engine.generate({
      startPaperId,
      sliderValue: input.sliderValue,
      maxPaths: input.maxPaths,
      papers: paperLib.papers,
      references: paperLib.references,
      concepts: paperLib.concepts,
      memory: toMemorySnapshot(input.memory),
    });
    return toUiWormholeCards(engineCards);
  }
}

/**
 * Default singleton instance of the frozen-contract adapter.
 */
let _defaultContract: WormholeEngineContract | null = null;
export function getDefaultWormholeEngineContract(): WormholeEngineContract {
  if (!_defaultContract) _defaultContract = new WormholeEngineContract();
  return _defaultContract;
}

/**
 * 冻结契约函数形式：generateWormholes(input)（03-01 补交，责任书要求的公开函数）。
 */
export function generateWormholes(
  input: Parameters<WormholeEngine["generateWormholes"]>[0]
): Promise<WormholeCard[]> {
  return getDefaultWormholeEngineContract().generateWormholes(input);
}
