/**
 * 队友02 模块目录 — lib/catalog/
 * 冻结接口：实现 lib/types.ts 中的 CatalogAdapter。
 *
 * 待实现文件：
 *   adapter.ts            — CatalogAdapter 接口的导出点
 *   seedCatalogAdapter.ts — 基于 Prisma/seed 的实现
 *   ranking.ts            — 资源排序（memory 感知）
 *
 * 接入方式：完成后在 lib/agent/orchestrator.ts 搜索
 * "INTEGRATION POINT [队友02]" 替换 fallback 调用。
 * 未接入期间由 lib/mock/fallbackEngine.ts 兜底，链路保持可跑。
 */
export type { CatalogAdapter } from "@/lib/types";
