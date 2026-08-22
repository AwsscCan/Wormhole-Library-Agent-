/**
 * Living Library consent 隐私状态测试（队友02）
 *
 * 覆盖责任书必测场景：
 *   - private / paused 完全过滤
 *   - discoverable_anonymous 可展示但不暴露身份
 *   - discoverable_named 档案展示可带 displayName
 *   - PersonMatchCard 推荐卡联系前强制匿名
 *   - assertCardPrivacy 断言辅助
 */
import { describe, expect, it } from "vitest";
import {
  canShowLivingBook,
  toLivingBookCard,
  toPersonMatchCard,
  assertCardPrivacy,
  isAnonymous,
  type LivingBookProfile,
} from "@/lib/matching/consent";
import { livingLibraryService } from "@/lib/matching/livingLibrary";

/* ------------------------------------------------------------------ */
/* 测试夹具                                                              */
/* ------------------------------------------------------------------ */

function makeProfile(
  overrides: Partial<LivingBookProfile> & { id: string; consentState: string },
): LivingBookProfile {
  return {
    displayMode: "anonymous",
    displayName: null,
    headline: "测试人物简介",
    conceptIds: ["c_ai_agent"],
    expertiseLevel: "peer",
    willingTypes: ["async_answer"],
    availabilityNote: null,
    ...overrides,
  };
}

const profilePrivate = makeProfile({ id: "p_private", consentState: "private" });
const profilePaused = makeProfile({ id: "p_paused", consentState: "paused" });
const profileAnon = makeProfile({
  id: "p_anon",
  consentState: "discoverable_anonymous",
  displayMode: "anonymous",
  displayName: null,
  headline: "匿名人物简介",
});
const profileNamed = makeProfile({
  id: "p_named",
  consentState: "discoverable_named",
  displayMode: "named",
  displayName: "张三",
  headline: "具名人物简介",
});
// 防御性：displayMode=named 但 consentState=anonymous（不一致情形）
const profileMismatch = makeProfile({
  id: "p_mismatch",
  consentState: "discoverable_anonymous",
  displayMode: "named", // 声称具名但 consent 只是 anonymous
  displayName: "不该出现",
  headline: "不一致情形",
});

/* ------------------------------------------------------------------ */
/* canShowLivingBook：可见性判断                                          */
/* ------------------------------------------------------------------ */

describe("canShowLivingBook", () => {
  it("private → 不可见", () => {
    expect(canShowLivingBook(profilePrivate)).toBe(false);
  });

  it("paused → 不可见", () => {
    expect(canShowLivingBook(profilePaused)).toBe(false);
  });

  it("discoverable_anonymous → 可见", () => {
    expect(canShowLivingBook(profileAnon)).toBe(true);
  });

  it("discoverable_named → 可见", () => {
    expect(canShowLivingBook(profileNamed)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* toLivingBookCard：档案展示页卡片转换                                    */
/* ------------------------------------------------------------------ */

describe("toLivingBookCard", () => {
  it("private 档案卡不应被生成（调用者须先过 canShow）", () => {
    // 如果违规调用，至少不暴露 displayName
    const card = toLivingBookCard(profilePrivate);
    expect(card.displayMode).toBe("anonymous");
    expect(card.displayName).toBeUndefined();
  });

  it("anonymous 卡片 displayMode=anonymous，无 displayName", () => {
    const card = toLivingBookCard(profileAnon);
    expect(card.displayMode).toBe("anonymous");
    expect(card.displayName).toBeUndefined();
  });

  it("named 卡片 displayMode=named，有 displayName", () => {
    const card = toLivingBookCard(profileNamed);
    expect(card.displayMode).toBe("named");
    expect(card.displayName).toBe("张三");
  });

  it("consentState=anonymous 但 displayMode=named 时，卡片应强制匿名", () => {
    const card = toLivingBookCard(profileMismatch);
    expect(card.displayMode).toBe("anonymous");
    expect(card.displayName).toBeUndefined();
  });

  it("匿名卡片不包含 displayName（assertCardPrivacy 验证）", () => {
    const card = toLivingBookCard(profileAnon);
    const { safe } = assertCardPrivacy(card);
    expect(safe).toBe(true);
  });

  it("具名卡片隐私检查：named 时不报违规", () => {
    const card = toLivingBookCard(profileNamed);
    // named 卡片带 displayName 是合法的，assertCardPrivacy 针对 anonymous 卡
    expect(card.displayMode).toBe("named");
    expect(card.displayName).toBeTruthy();
  });

  it("contactState 默认为 request_required", () => {
    const card = toLivingBookCard(profileNamed);
    expect(card.contactState).toBe("request_required");
  });
});

/* ------------------------------------------------------------------ */
/* toPersonMatchCard：推荐卡联系前强制匿名                                 */
/* ------------------------------------------------------------------ */

describe("toPersonMatchCard（推荐卡）", () => {
  it("discoverable_named 人物的推荐卡仍是 anonymous", () => {
    const card = toPersonMatchCard(profileNamed, ["c_ai_agent"], "测试理由", 0.8);
    expect(card.displayMode).toBe("anonymous");
  });

  it("推荐卡不拼接 displayName 到 headline", () => {
    const card = toPersonMatchCard(profileNamed, ["c_ai_agent"], "测试理由", 0.8);
    // headline 不应该包含 displayName（"张三"）
    expect(card.headline).not.toContain("张三");
    expect(card.headline).toBe(profileNamed.headline);
  });

  it("推荐卡 contactState = request_required", () => {
    const card = toPersonMatchCard(profileAnon, ["c_ai_agent"], "理由", 0.7);
    expect(card.contactState).toBe("request_required");
  });

  it("推荐卡 id 以 pm_ 开头", () => {
    const card = toPersonMatchCard(profileNamed, [], "理由", 0.6);
    expect(card.id).toMatch(/^pm_/);
  });

  it("推荐卡包含 bridge 和 collisionReason", () => {
    const bridge = ["c_ai_agent", "c_planning"];
    const reason = "互补碰撞理由";
    const card = toPersonMatchCard(profileNamed, bridge, reason, 0.75);
    expect(card.bridge).toEqual(bridge);
    expect(card.collisionReason).toBe(reason);
    expect(card.score).toBe(0.75);
  });
});

/* ------------------------------------------------------------------ */
/* isAnonymous 辅助                                                     */
/* ------------------------------------------------------------------ */

describe("isAnonymous", () => {
  it("anonymous 卡片返回 true", () => {
    const card = toLivingBookCard(profileAnon);
    expect(isAnonymous(card)).toBe(true);
  });

  it("named 卡片返回 false", () => {
    const card = toLivingBookCard(profileNamed);
    expect(isAnonymous(card)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* assertCardPrivacy                                                    */
/* ------------------------------------------------------------------ */

describe("assertCardPrivacy", () => {
  it("anonymous 卡无 displayName → safe=true", () => {
    const card = toLivingBookCard(profileAnon);
    const result = assertCardPrivacy(card);
    expect(result.safe).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("篡改 anonymous 卡注入 displayName → safe=false，violations 非空", () => {
    const card = toLivingBookCard(profileAnon);
    // 模拟数据泄漏情形
    const tampered = { ...card, displayName: "泄露的名字" };
    const result = assertCardPrivacy(tampered);
    expect(result.safe).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* livingLibraryService：consent 过滤集成                               */
/* ------------------------------------------------------------------ */

describe("livingLibraryService consent 过滤", () => {
  it("searchLivingBooks 不返回 private 人物", async () => {
    const results = await livingLibraryService.searchLivingBooks({
      conceptIds: ["c_transformer", "c_information_theory", "c_statistical_physics"],
      limit: 10,
    });
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("lb_private_example");
  });

  it("searchLivingBooks 不返回 paused 人物", async () => {
    const results = await livingLibraryService.searchLivingBooks({
      conceptIds: ["c_rag", "c_pkm", "c_agent_memory"],
      limit: 10,
    });
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("lb_006");
  });

  it("searchLivingBooks 返回的匿名人物不含 displayName", async () => {
    const results = await livingLibraryService.searchLivingBooks({
      conceptIds: ["c_ai_agent"],
      limit: 10,
    });
    const anonCards = results.filter((r) => r.displayMode === "anonymous");
    for (const card of anonCards) {
      expect(card.displayName).toBeUndefined();
    }
  });

  it("findLivingBooksByConcept 不返回 private / paused 人物", async () => {
    // c_transformer 被 lb_private_example 引用，但 private 不应返回
    const results = await livingLibraryService.findLivingBooksByConcept("c_transformer", 10);
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("lb_private_example");
  });

  it("返回结果中所有卡片的 contactState 均为 request_required", async () => {
    const results = await livingLibraryService.searchLivingBooks({
      conceptIds: ["c_ai_agent"],
      limit: 10,
    });
    for (const card of results) {
      expect(card.contactState).toBe("request_required");
    }
  });
});
