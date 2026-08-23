/**
 * Concepts Module — Public API
 *
 * Re-exports the frozen ConceptExtractor interface and its implementation.
 * The orchestrator should import from here, not from internal files.
 *
 * 03-01 补交：新增冻结契约 ConceptExtractor 的适配器实现
 * ConceptExtractorContract / extractConcepts()，编排层与外部调用方
 * 应通过它们（而非论文级内部类）使用概念抽取能力。
 */

import type { ConceptExtractor, ConceptRef, TaskType, Level } from "../types";
import { ConceptExtractorImpl } from "./conceptExtraction";
import { loadConceptGraph } from "./graph";

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

/**
 * ConceptExtractorContract — 冻结契约 ConceptExtractor 的适配器实现（03-01 补交）。
 *
 * 将论文级 ConceptExtractorImpl.extractFromText(text) 适配为冻结签名
 * extractConcepts(query) -> { concepts: ConceptRef[] }：
 * 概念图关键词匹配 + score 排序，取前 8 个映射为 UI 层 ConceptRef。
 */
export class ConceptExtractorContract implements ConceptExtractor {
  private impl: ConceptExtractorImpl;

  constructor(impl?: ConceptExtractorImpl) {
    this.impl = impl ?? new ConceptExtractorImpl();
  }

  async extractConcepts(query: string): Promise<{
    concepts: ConceptRef[];
    taskType?: TaskType;
    level?: Level;
  }> {
    const tagHits = this.impl.extractFromText(query).slice(0, 8);
    const graph = loadConceptGraph();
    const concepts: ConceptRef[] = tagHits.map((t) => ({
      id: t.id,
      name: t.name,
      domain: graph.nodes.get(t.id)?.domain,
    }));
    return { concepts };
  }
}

/**
 * Default singleton instance of the frozen-contract adapter.
 */
let _defaultContract: ConceptExtractorContract | null = null;
export function getDefaultConceptExtractorContract(): ConceptExtractorContract {
  if (!_defaultContract) _defaultContract = new ConceptExtractorContract();
  return _defaultContract;
}

/**
 * 冻结契约函数形式：extractConcepts(query)（03-01 补交，责任书要求的公开函数）。
 */
export function extractConcepts(query: string): Promise<{
  concepts: ConceptRef[];
  taskType?: TaskType;
  level?: Level;
}> {
  return getDefaultConceptExtractorContract().extractConcepts(query);
}
