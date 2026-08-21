/**
 * Living Library 检索模块（队友02）
 *
 * 实现 lib/types.ts 的 LivingLibraryService，严格遵守 consent 过滤：
 * private / paused 人物绝不返回。
 *
 * 额外提供 findCollisionCandidates（Knowledge Collision 互补碰撞匹配），
 * 供 orchestrator 的 matches 接入点使用。
 */
import livingBooksSeed from "@/data/seed-living-books.json";
import type { LivingBookCard, LivingLibraryService, PersonMatchCard, WillingType } from "@/lib/types";
import {
  canShowLivingBook,
  toLivingBookCard,
  toPersonMatchCard,
  type LivingBookProfile,
} from "./consent";

type SeedLivingBook = (typeof livingBooksSeed)["livingBooks"][number];

const livingBooks: SeedLivingBook[] = livingBooksSeed.livingBooks;

function toProfile(lb: SeedLivingBook): LivingBookProfile {
  return {
    id: lb.id,
    displayMode: lb.displayMode as LivingBookProfile["displayMode"],
    displayName: lb.displayName,
    headline: lb.headline,
    consentState: lb.consentState,
    conceptIds: lb.conceptIds,
    expertiseLevel: lb.expertiseLevel as LivingBookProfile["expertiseLevel"],
    willingTypes: lb.willingTypes as WillingType[],
    availabilityNote: lb.availabilityNote,
  };
}

/* ---------------- 相关性评分 ---------------- */

const LEVEL_WEIGHT: Record<string, number> = {
  mentor: 1.0,
  senior: 0.8,
  peer: 0.6,
};

/** score = 概念交集占比 * 0.70 + expertiseLevel * 0.30 */
function relevanceScore(profile: LivingBookProfile, queryConceptIds: string[]): number {
  if (queryConceptIds.length === 0) {
    return LEVEL_WEIGHT[profile.expertiseLevel] * 0.3;
  }
  const intersection = profile.conceptIds.filter((id) =>
    queryConceptIds.includes(id),
  ).length;
  const conceptScore = intersection / queryConceptIds.length;
  return conceptScore * 0.7 + LEVEL_WEIGHT[profile.expertiseLevel] * 0.3;
}

/* ---------------- 主检索服务 ---------------- */

export const livingLibraryService: LivingLibraryService = {
  async searchLivingBooks(input) {
    const { conceptIds, limit = 5 } = input;
    const profiles = livingBooks.map(toProfile).filter(canShowLivingBook);

    const scored = profiles
      .map((p) => ({ p, score: relevanceScore(p, conceptIds) }))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => toLivingBookCard(s.p));
  },

  async findLivingBooksByConcept(conceptId, limit = 10) {
    const matched = livingBooks
      .map(toProfile)
      .filter((p) => canShowLivingBook(p) && p.conceptIds.includes(conceptId))
      .map(toLivingBookCard);
    return matched.slice(0, limit);
  },
};

/* ---------------- Knowledge Collision 互补碰撞匹配 ---------------- */

/**
 * 为单个用户找「互补碰撞」的 Living Library 人物。
 *
 * 原则：不是找最相似的人，而是找知识结构有价值差异的人。
 * 目标距离 ≈ 0.55（不太近也不太远），通过 bridge 概念解释为什么值得相遇。
 */
export async function findCollisionCandidates(
  userConceptIds: string[],
  limit = 3,
): Promise<PersonMatchCard[]> {
  const profiles = livingBooks.map(toProfile).filter(canShowLivingBook);

  const scored = profiles.map((p) => {
    const union = new Set([...userConceptIds, ...p.conceptIds]).size;
    const intersection = p.conceptIds.filter((id) =>
      userConceptIds.includes(id),
    ).length;
    const similarity = union > 0 ? intersection / union : 0;
    const topicDistance = 1 - similarity;
    const distanceFit = 1 - Math.abs(topicDistance - 0.55);

    const bridge = p.conceptIds.filter((id) => userConceptIds.includes(id));
    const complement = p.conceptIds.filter((id) => !userConceptIds.includes(id));
    const complementarity = Math.min(complement.length / 3, 1.0);

    const score =
      0.35 * distanceFit +
      0.35 * (bridge.length > 0 ? 1.0 : 0.0) +
      0.25 * complementarity +
      0.05 * LEVEL_WEIGHT[p.expertiseLevel];

    return { p, score, bridge, complement };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ p, bridge, complement, score }) => {
    const reason = buildCollisionReason(bridge, complement);
    return toPersonMatchCard(p, bridge, reason, Math.round(score * 100) / 100);
  });
}

function buildCollisionReason(bridge: string[], complement: string[]): string {
  if (bridge.length === 0 && complement.length === 0) {
    return "该同学来自相邻研究领域，可能带来不同视角的知识碰撞。";
  }
  const bridgePart =
    bridge.length > 0 ? `你们共同关注 ${bridge.slice(0, 2).join("、")} 等主题` : "";
  const complementPart =
    complement.length > 0
      ? `对方额外掌握 ${complement.slice(0, 2).join("、")} 方向`
      : "";
  const parts = [bridgePart, complementPart].filter(Boolean);
  return parts.join("，") + "，是一次有价值的互补碰撞。";
}
