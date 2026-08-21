/**
 * 馆藏适配器导出点（队友02）
 *
 * 团队统一从这里拿 CatalogAdapter 实现，接入 orchestrator 时
 * 把 INTEGRATION POINT [队友02] 处的 searchCatalogFallback 替换为本实现。
 *
 * 接入示例（orchestrator.ts）：
 *   import { catalogAdapter } from "@/lib/catalog/adapter";
 *   const resources = await catalogAdapter.searchCatalog({
 *     query, conceptIds, language, limit,
 *   });
 */
export { seedCatalogAdapter as catalogAdapter } from "./seedCatalogAdapter";
export { rankResources, scoreResource, WEIGHTS } from "./ranking";
export type { RankContext } from "./ranking";
export type { CatalogAdapter } from "@/lib/types";
