/**
 * Living Library 同意与隐私模块（队友02）
 *
 * 隐私硬规则（不可妥协）：
 *   - private → 完全不可见
 *   - paused  → 完全不可见
 *   - discoverable_anonymous → 可见，但绝不暴露 displayName
 *   - discoverable_named     → 可见，可显示 displayName（仅档案展示页）
 *
 * 两套卡片的展示差异：
 *   - LivingBookCard（档案展示页）：discoverable_named 可以带 displayName
 *   - PersonMatchCard（匹配推荐卡）：联系人接受前必须匿名，不暴露身份
 *     理由：推荐卡是系统主动触达，不是用户主动访问档案，所以要求更严格的保护
 *     只有当 contactState 变为 "accepted" 后，前端才可展示具名信息（后端不负责那层）
 *
 * 原则：宁可少展示，不可泄露身份。
 */
import conceptsSeed from "@/data/seed-concepts.json";
import type {
  ConceptRef,
  ContactState,
  LivingBookCard,
  PersonMatchCard,
  WillingType,
} from "@/lib/types";

const conceptById = new Map(conceptsSeed.concepts.map((c) => [c.id, c]));

function toConceptRef(id: string): ConceptRef {
  const c = conceptById.get(id);
  return c ? { id: c.id, name: c.name, domain: c.domain } : { id, name: id };
}

/** seed 人物结构（对齐 data/seed-living-books.json 的 livingBooks 元素） */
export interface LivingBookProfile {
  id: string;
  displayMode: "anonymous" | "named";
  displayName?: string | null;
  headline: string;
  consentState: string;
  conceptIds: string[];
  expertiseLevel: "peer" | "senior" | "mentor";
  willingTypes: WillingType[];
  availabilityNote?: string | null;
}

/* ---------------- 核心判断 ---------------- */

/** 判断某人物是否可对外展示。 */
export function canShowLivingBook(profile: LivingBookProfile): boolean {
  return (
    profile.consentState === "discoverable_anonymous" ||
    profile.consentState === "discoverable_named"
  );
}

/** 判断卡片是否为匿名模式（用于隐私断言）。 */
export function isAnonymous(card: LivingBookCard): boolean {
  return card.displayMode === "anonymous";
}

/* ---------------- 转换：profile → card ---------------- */

/**
 * 将内部档案转为对外安全的卡片。
 * 只有 discoverable_named + displayMode=named 才带 displayName。
 */
export function toLivingBookCard(profile: LivingBookProfile): LivingBookCard {
  const isNamed =
    profile.consentState === "discoverable_named" &&
    profile.displayMode === "named";

  return {
    id: profile.id,
    displayMode: isNamed ? "named" : "anonymous",
    displayName: isNamed && profile.displayName ? profile.displayName : undefined,
    headline: profile.headline,
    expertiseConcepts: profile.conceptIds.map(toConceptRef),
    willingTypes: profile.willingTypes,
    expertiseLevel: profile.expertiseLevel,
    availabilityNote: profile.availabilityNote ?? undefined,
    contactState: "request_required" as ContactState,
  };
}

/* ---------------- 转换：profile → person match card ---------------- */

/**
 * 生成人物碰撞匹配卡（推荐卡联系前强制匿名）。
 *
 * 设计决策：PersonMatchCard 是系统主动推送的匹配结果，和用户主动浏览档案不同。
 * 在联系人接受（contactState = "accepted"）之前，displayMode 必须为 "anonymous"，
 * 不得暴露 headline 以外的任何可识别信息。
 * 这与 orchestrator.ts INTEGRATION POINT 注释「推荐卡永远匿名」保持一致。
 *
 * @param profile         活馆藏档案
 * @param bridge          桥接概念名列表（解释为什么匹配）
 * @param collisionReason 为什么值得相遇（人话）
 * @param score           匹配分 0..1
 */
export function toPersonMatchCard(
  profile: LivingBookProfile,
  bridge: string[],
  collisionReason: string,
  score: number,
): PersonMatchCard {
  // 推荐卡在联系人接受前统一匿名，不依赖 consentState 是否为 named
  // 档案页（toLivingBookCard）才区分 named/anonymous
  return {
    id: `pm_${profile.id}`,
    displayMode: "anonymous",
    headline: profile.headline, // 不拼接 displayName，避免身份泄露
    bridge,
    collisionReason,
    score,
    contactState: "request_required",
  };
}

/* ---------------- 隐私断言辅助（供测试使用） ---------------- */

/** 检查一张卡片是否安全：anonymous 时不应包含 displayName。 */
export function assertCardPrivacy(card: LivingBookCard): {
  safe: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  if (card.displayMode === "anonymous" && card.displayName !== undefined) {
    violations.push(
      `anonymous 卡片不应包含 displayName，但发现值: "${card.displayName}"`,
    );
  }
  return { safe: violations.length === 0, violations };
}
