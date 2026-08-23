/**
 * OpenAlex 适配器单元测试（全 mock fetch，不打外网）
 *
 * 覆盖：字段映射 / 概念映射 / 概念命中优先排序 / 网络失败回退 seed /
 * OPENALEX_DISABLED 开关 / 空结果回退
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { openAlexAdapter } from "@/lib/catalog/openAlexAdapter";
import { seedCatalogAdapter } from "@/lib/catalog/seedCatalogAdapter";

function makeWork(overrides: Partial<Record<string, unknown>> & { id?: string; display_name?: string }) {
  return {
    id: `https://openalex.org/W${Math.floor(Math.random() * 1e9)}`,
    display_name: "A Study of Multi-Agent Coordination",
    publication_year: 2023,
    cited_by_count: 42,
    language: "en",
    open_access: { is_oa: true },
    primary_location: {
      source: { display_name: "Journal of Agents" },
      landing_page_url: "https://example.com/paper",
    },
    authorships: [{ author: { display_name: "Alice" } }, { author: { display_name: "Bob" } }],
    concepts: [
      { id: "https://openalex.org/C1", display_name: "Multi-Agent Coordination", score: 0.9 },
      { id: "https://openalex.org/C2", display_name: "Completely Unknown Field", score: 0.3 },
    ],
    abstract_inverted_index: { "Multi-agent": [0], "systems": [1], "rock": [2] },
    ...overrides,
  } as Record<string, unknown>;
}

function stubFetchWith(works: unknown[] | { status: number }) {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ results: works }),
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const INPUT = { query: "multi-agent coordination", limit: 5 };
/** seed 馆藏确定命中的查询（回退断言用） */
const SEED_INPUT = { query: "game theory", limit: 5 };

describe("OpenAlex 适配器", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.OPENALEX_DISABLED = "1"; // vitest.config 默认
  });

  it("字段映射：works → ResourceCard（id 前缀/OA→online/年份/作者/来源链接）", async () => {
    process.env.OPENALEX_DISABLED = "";
    stubFetchWith([makeWork({})]);
    const cards = await openAlexAdapter.searchCatalog(INPUT);
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.id).toMatch(/^oa:W\d+$/);
    expect(c.type).toBe("paper");
    expect(c.title).toBe("A Study of Multi-Agent Coordination");
    expect(c.authors).toEqual(["Alice", "Bob"]);
    expect(c.year).toBe(2023);
    expect(c.availability).toBe("online");
    expect(c.sourceUrl).toBe("https://example.com/paper");
    expect(c.why).toContain("multi-agent coordination");
    expect(c.why).toContain("被引 42 次");
    expect(c.why).toContain("Multi-agent systems rock");
  });

  it("概念映射：OpenAlex 概念名命中本地概念图（含摘要拼接进 why）", async () => {
    process.env.OPENALEX_DISABLED = "";
    stubFetchWith([makeWork({})]);
    const cards = await openAlexAdapter.searchCatalog(INPUT);
    const ids = cards[0].concepts.map((c) => c.id);
    expect(ids).toContain("c_multi_agent");
    // 未命中概念（Completely Unknown Field）不产生本地概念
    expect(cards[0].concepts.every((c) => c.name !== "Completely Unknown Field")).toBe(true);
  });

  it("排序：概念命中的论文排在未命中论文前面", async () => {
    process.env.OPENALEX_DISABLED = "";
    stubFetchWith([
      makeWork({ concepts: [], display_name: "No Concept Paper" }),
      makeWork({}), // 带 Multi-Agent Coordination 概念
    ]);
    const cards = await openAlexAdapter.searchCatalog(INPUT);
    expect(cards).toHaveLength(2);
    expect(cards[0].concepts.length).toBeGreaterThan(0);
    expect(cards[1].concepts.length).toBe(0);
  });

  it("网络失败 → 静默回退 seed 适配器（不抛错）", async () => {
    process.env.OPENALEX_DISABLED = "";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const cards = await openAlexAdapter.searchCatalog(SEED_INPUT);
    const seedCards = await seedCatalogAdapter.searchCatalog(SEED_INPUT);
    expect(cards.map((c) => c.id)).toEqual(seedCards.map((c) => c.id));
  });

  it("HTTP 非 200 → 回退 seed", async () => {
    process.env.OPENALEX_DISABLED = "";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    const cards = await openAlexAdapter.searchCatalog(SEED_INPUT);
    expect(cards.length).toBeGreaterThan(0); // seed 有馆藏
  });

  it("OpenAlex 返回空结果 → 回退 seed（demo 永不空屏）", async () => {
    process.env.OPENALEX_DISABLED = "";
    stubFetchWith([]);
    const cards = await openAlexAdapter.searchCatalog(SEED_INPUT);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("OPENALEX_DISABLED=1 → 直接走 seed，不发网络请求", async () => {
    process.env.OPENALEX_DISABLED = "1";
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    const cards = await openAlexAdapter.searchCatalog(SEED_INPUT);
    expect(mock).not.toHaveBeenCalled();
    expect(cards.length).toBeGreaterThan(0);
  });

  it("非 OA 论文 → availability=unknown，被引归一 qualityScore ∈ [0.3, 1]", async () => {
    process.env.OPENALEX_DISABLED = "";
    stubFetchWith([makeWork({ open_access: { is_oa: false }, cited_by_count: 5000 })]);
    const cards = await openAlexAdapter.searchCatalog(INPUT);
    expect(cards[0].availability).toBe("unknown");
    expect(cards[0].qualityScore).toBeGreaterThanOrEqual(0.3);
    expect(cards[0].qualityScore).toBeLessThanOrEqual(1);
  });
});
