/**
 * CatalogAdapter 契约测试（队友02）
 *
 * 校验 lib/types.ts 中 CatalogAdapter 接口的实现：
 *  - searchCatalog 返回 ResourceCard[]（字段完整）
 *  - getResourceDetails / findResourcesByConcept 行为正确
 *  - 排序符合概念交集 + 语言偏好
 */
import { describe, expect, it } from "vitest";
import { catalogAdapter } from "@/lib/catalog/adapter";

describe("CatalogAdapter (seed)", () => {
  it("searchCatalog returns frozen ResourceCard shape", async () => {
    const resources = await catalogAdapter.searchCatalog({
      query: "AI Agent",
      conceptIds: ["c_ai_agent"],
    });

    expect(Array.isArray(resources)).toBe(true);
    expect(resources.length).toBeGreaterThan(0);

    const r = resources[0];
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("title");
    expect(r).toHaveProperty("authors");
    expect(r).toHaveProperty("why");
    expect(r).toHaveProperty("availability");
    expect(r).toHaveProperty("difficulty");
    expect(r).toHaveProperty("qualityScore");
    expect(Array.isArray(r.concepts)).toBe(true);
  });

  it("searchCatalog filters by conceptIds (every result binds the concept)", async () => {
    const resources = await catalogAdapter.searchCatalog({
      query: "game theory",
      conceptIds: ["c_game_theory"],
      limit: 20,
    });

    expect(resources.length).toBeGreaterThan(0);
    for (const r of resources) {
      const ids = r.concepts.map((c) => c.id);
      expect(ids).toContain("c_game_theory");
    }
  });

  it("searchCatalog respects resourceTypes filter", async () => {
    const resources = await catalogAdapter.searchCatalog({
      query: "AI",
      conceptIds: ["c_ai_agent"],
      resourceTypes: ["course"],
    });

    expect(resources.length).toBeGreaterThan(0);
    for (const r of resources) {
      expect(r.type).toBe("course");
    }
  });

  it("searchCatalog with language=zh ranks Chinese resources first", async () => {
    const resources = await catalogAdapter.searchCatalog({
      query: "智能体",
      conceptIds: ["c_ai_agent"],
      language: "zh",
      limit: 10,
    });

    expect(resources.length).toBeGreaterThan(0);
    // 若结果里同时存在中英文，中文应排在英文前
    const langs = resources.map((r) => r.language);
    const firstZh = langs.indexOf("zh");
    const firstEn = langs.indexOf("en");
    if (firstZh !== -1 && firstEn !== -1) {
      expect(firstZh).toBeLessThan(firstEn);
    }
  });

  it("getResourceDetails returns a resource or null", async () => {
    const found = await catalogAdapter.getResourceDetails("r_aima");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("r_aima");

    const missing = await catalogAdapter.getResourceDetails("r_does_not_exist");
    expect(missing).toBeNull();
  });

  it("findResourcesByConcept returns resources bound to that concept", async () => {
    const resources = await catalogAdapter.findResourcesByConcept("c_mechanism_design");
    expect(resources.length).toBeGreaterThan(0);
    for (const r of resources) {
      expect(r.concepts.map((c) => c.id)).toContain("c_mechanism_design");
    }
  });

  it("seed catalog contains at least 30 resources (responsibility package requirement)", async () => {
    // 通过一个宽泛概念把所有资源捞出来，验证数据量
    const all = await catalogAdapter.searchCatalog({
      query: "",
      limit: 100,
    });
    // 注意：空 query 无 conceptIds 时返回全部资源
    expect(all.length).toBeGreaterThanOrEqual(30);
  });
});
