/**
 * 馆藏适配器导出点（队友02）
 *
 * 默认导出 OpenAlex 适配器（真实论文搜索，失败静默回退 seed）；
 * 设置 OPENALEX_DISABLED=1 可强制只用 seed（测试/离线演示）。
 */
export { openAlexAdapter as catalogAdapter } from "./openAlexAdapter";
export { seedCatalogAdapter } from "./seedCatalogAdapter";
export { rankResources, scoreResource, WEIGHTS } from "./ranking";
export type { RankContext } from "./ranking";
export type { CatalogAdapter } from "@/lib/types";
