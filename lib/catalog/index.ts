/**
 * 队友02 模块目录 — lib/catalog/
 * 已实现 lib/types.ts 中的 CatalogAdapter（seed 版）。
 *
 * 实现文件：
 *   adapter.ts            — CatalogAdapter 导出点
 *   seedCatalogAdapter.ts — 基于 seed 的实现（searchCatalog / getResourceDetails / findResourcesByConcept）
 *   ranking.ts            — 多维权重排序（taskType/level/quality/language/availability + memory）
 *
 * 接入方式：在 lib/agent/orchestrator.ts 搜索 "INTEGRATION POINT [队友02]"
 * 将 searchCatalogFallback 替换为 catalogAdapter.searchCatalog。
 * 未接入期间由 lib/mock/fallbackEngine.ts 兜底，链路保持可跑。
 */
export type { CatalogAdapter } from "@/lib/types";
export { catalogAdapter } from "./adapter";
export { rankResources, scoreResource, WEIGHTS } from "./ranking";
