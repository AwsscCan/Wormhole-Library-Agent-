/**
 * 队友03 模块目录 — lib/concepts/
 * 冻结接口：实现 lib/types.ts 中的 ConceptExtractor。
 *
 * 待实现文件：
 *   conceptExtraction.ts — 概念抽取（别名匹配 + 可选 LLM，必须有确定性 fallback）
 *   graph.ts             — 概念图路径搜索（2-5 跳）
 *   vectors.ts           — 确定性伪 embedding / cosine
 *
 * 接入方式：orchestrator.ts 搜索 "INTEGRATION POINT [队友03]"。
 */
export type { ConceptExtractor } from "@/lib/types";
