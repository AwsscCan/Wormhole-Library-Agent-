/**
 * 馆藏适配器导出点（队友02）
 *
 * 默认导出联邦适配器：真实 OpenAlex / Open Library 结果会保留来源链接；
 * 种子馆藏只作为可见的离线降级来源。
 */
export { federatedCatalogAdapter as catalogAdapter } from "./federatedCatalogAdapter";
export { seedCatalogAdapter } from "./seedCatalogAdapter";
export { rankResources, scoreResource, WEIGHTS } from "./ranking";
export type { RankContext } from "./ranking";
export type { CatalogAdapter } from "@/lib/types";
