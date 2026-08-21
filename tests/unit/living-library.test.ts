/**
 * Living Library 检索 + consent 契约测试（队友02）
 *
 * 校验 lib/types.ts 的 LivingLibraryService 与隐私硬规则：
 *  - private / paused 人物绝不返回
 *  - anonymous 卡片绝不暴露 displayName
 *  - named 卡片才带 displayName
 */
import { describe, expect, it } from "vitest";
import { livingLibraryService, findCollisionCandidates } from "@/lib/matching/livingLibrary";
import {
  canShowLivingBook,
  assertCardPrivacy,
  type LivingBookProfile,
} from "@/lib/matching/consent";

describe("LivingLibraryService (seed)", () => {
  it("searchLivingBooks returns frozen LivingBookCard shape", async () => {
    const cards = await livingLibraryService.searchLivingBooks({
      conceptIds: ["c_ai_agent"],
      limit: 5,
    });

    expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBeGreaterThan(0);

    const c = cards[0];
    expect(c).toHaveProperty("id");
    expect(c).toHaveProperty("displayMode");
    expect(c).toHaveProperty("headline");
    expect(Array.isArray(c.expertiseConcepts)).toBe(true);
    expect(c).toHaveProperty("expertiseLevel");
    expect(c).toHaveProperty("contactState");
    expect(c.contactState).toBe("request_required");
  });

  it("never returns private or paused profiles", async () => {
    const cards = await livingLibraryService.searchLivingBooks({
      conceptIds: ["c_transformer", "c_information_theory", "c_statistical_physics"],
      limit: 50,
    });

    // seed 中 private 人物（lb_private_example）绑定 c_transformer，绝不能出现
    const ids = cards.map((c) => c.id);
    expect(ids).not.toContain("lb_private_example");

    // 返回的都是可见卡片，且匿名卡不含 displayName
    for (const c of cards) {
      expect(assertCardPrivacy(c).safe).toBe(true);
    }
  });

  it("anonymous cards never expose displayName", async () => {
    const cards = await livingLibraryService.searchLivingBooks({
      conceptIds: ["c_cognitive_psychology", "c_human_memory", "c_library_science"],
      limit: 50,
    });

    for (const c of cards) {
      if (c.displayMode === "anonymous") {
        expect(c.displayName).toBeUndefined();
      }
    }
  });

  it("named cards keep displayName", async () => {
    const cards = await livingLibraryService.searchLivingBooks({
      conceptIds: ["c_mechanism_design", "c_game_theory"],
      limit: 50,
    });

    const named = cards.filter((c) => c.displayMode === "named");
    expect(named.length).toBeGreaterThan(0);
    for (const c of named) {
      expect(c.displayName).toBeTruthy();
    }
  });

  it("findLivingBooksByConcept returns consent-safe results for a concept", async () => {
    const cards = await livingLibraryService.findLivingBooksByConcept("c_game_theory");
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.expertiseConcepts.map((x) => x.id)).toContain("c_game_theory");
      expect(assertCardPrivacy(c).safe).toBe(true);
    }
  });

  it("findLivingBooksByConcept filters out private profiles", async () => {
    // lb_private_example 是 private，绑定 c_transformer；绝不能出现在结果里
    const cards = await livingLibraryService.findLivingBooksByConcept("c_transformer");
    const ids = cards.map((c) => c.id);
    expect(ids).not.toContain("lb_private_example");
  });

  it("canShowLivingBook enforces consent rules", async () => {
    const base = {
      id: "x",
      displayMode: "anonymous" as const,
      headline: "h",
      conceptIds: [],
      expertiseLevel: "peer" as const,
      willingTypes: [] as never[],
    };
    const profile = (consentState: string): LivingBookProfile => ({
      ...base,
      consentState,
    });

    expect(canShowLivingBook(profile("private"))).toBe(false);
    expect(canShowLivingBook(profile("paused"))).toBe(false);
    expect(canShowLivingBook(profile("discoverable_anonymous"))).toBe(true);
    expect(canShowLivingBook(profile("discoverable_named"))).toBe(true);
  });

  it("findCollisionCandidates returns anonymous-first match cards", async () => {
    const matches = await findCollisionCandidates(["c_ai_agent", "c_planning"], 3);
    expect(Array.isArray(matches)).toBe(true);
    for (const m of matches) {
      expect(m).toHaveProperty("headline");
      expect(m).toHaveProperty("bridge");
      expect(m).toHaveProperty("collisionReason");
      expect(m).toHaveProperty("score");
      expect(m.contactState).toBe("request_required");
    }
  });
});
