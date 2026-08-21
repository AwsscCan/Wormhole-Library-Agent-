/**
 * 队友02+03 模块目录 — lib/matching/
 *
 * 已实现（队友02）：
 *   consent.ts       — consent 状态机（private/paused 绝不返回；匿名不露名）
 *   livingLibrary.ts — LivingBook 检索与排序 + 互补碰撞匹配
 *
 * 待实现（队友03）：
 *   collision.ts     — 碰撞匹配评分算法增强
 *
 * 隐私硬规则（不可妥协）：
 *   1. 推荐卡永远匿名。
 *   2. 双方同意前不暴露联系方式。
 *   3. matchingMode === "off" 时返回空。
 */
export type { LivingLibraryService } from "@/lib/types";
export { livingLibraryService, findCollisionCandidates } from "./livingLibrary";
export { canShowLivingBook, toLivingBookCard, toPersonMatchCard } from "./consent";
