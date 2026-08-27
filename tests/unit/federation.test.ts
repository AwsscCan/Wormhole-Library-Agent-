/**
 * M5 联邦编排器测试 —— 双远端源全 stub + seed 注入，零真实网络。
 * 核心：并行扇出的结果合并、失败如实上报、degraded 判定、永不抛异常。
 */

import { describe, expect, it } from "vitest";

import { federateSearch } from "@/lib/federation/federation";
import type { ResourceCard } from "@/lib/types";

const FIXED_NOW = 1_750_000_000_000;
const NOW = () => FIXED_NOW;

function okTransport(body: unknown): () => Promise<Response> {
  return async () => new Response(JSON.stringify(body), { status: 200 });
}

function failTransport(): () => Promise<Response> {
  return async () => {
    throw new TypeError("fetch failed");
  };
}

const OPENALEX_DOI = "10.5555/3295222.3295349";

function openAlexBody(): unknown {
  return {
    results: [
      {
        id: "https://openalex.org/W2741809807",
        doi: `https://doi.org/${OPENALEX_DOI}`,
        display_name: "Attention Is All You Need",
        publication_year: 2017,
        authorships: [{ author: { display_name: "Ashish Vaswani" } }],
      },
    ],
  };
}

function openLibraryBody(): unknown {
  return {
    docs: [
      {
        key: "/works/OL45804W",
        title: "Attention Is All You Need",
        author_name: ["Ashish Vaswani"],
        first_publish_year: 2017,
        doi: [OPENALEX_DOI],
      },
    ],
  };
}

function seedCards(): ResourceCard[] {
  return [
    {
      id: "seed:attention-101",
      type: "paper",
      title: "注意力机制入门",
      authors: ["某人"],
      language: "zh",
      why: "seed",
      location: "本地",
      availability: "online",
      difficulty: "undergrad",
      concepts: [],
      qualityScore: 0.5,
    },
  ];
}

const SEED = async () => seedCards();

describe("federateSearch 三源扇出", () => {
  it("全源成功 → 去重合并，Open Library 同 DOI 条目与 OpenAlex 合成一条双源 item", async () => {
    const result = await federateSearch(
      { topic: "attention" },
      {
        openAlex: { transport: okTransport(openAlexBody()), now: NOW },
        openLibrary: { transport: okTransport(openLibraryBody()), now: NOW },
        seedSearch: SEED,
        now: NOW,
      },
    );
    expect(result.failures).toHaveLength(0);
    // OpenAlex+OpenLibrary 同 DOI 合并 1 条 + seed 独立 1 条
    expect(result.items).toHaveLength(2);
    const merged = result.items.find((i) => i.sources.length > 1);
    expect(merged).toBeDefined();
    expect(merged?.sources.map((s) => s.kind).sort()).toEqual(["openalex", "openlibrary"]);
    expect(merged?.id).toBe(`doi:${OPENALEX_DOI}`);
    expect(result.degraded).toBe(false);
  });

  it("Open Library 失败（被墙）→ 失败如实上报，其余源结果照常返回", async () => {
    const result = await federateSearch(
      { topic: "attention" },
      {
        openAlex: { transport: okTransport(openAlexBody()), now: NOW },
        openLibrary: { transport: failTransport(), now: NOW },
        seedSearch: SEED,
        now: NOW,
      },
    );
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.kind).toBe("unreachable");
    expect(result.failures[0]?.source).toBe("openlibrary");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.degraded).toBe(false);
  });

  it("全源失败/空 → degraded=true，items 空，失败全量列出", async () => {
    const result = await federateSearch(
      { topic: "nothing" },
      {
        openAlex: { transport: failTransport(), now: NOW },
        openLibrary: { transport: failTransport(), now: NOW },
        seedSearch: async () => [],
        now: NOW,
      },
    );
    expect(result.items).toHaveLength(0);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((f) => f.source).sort()).toEqual(["openalex", "openlibrary"]);
    expect(result.degraded).toBe(true);
  });

  it("includeSeed=false → seed 不参与，无 seed 来源条目", async () => {
    const result = await federateSearch(
      { topic: "attention" },
      {
        includeSeed: false,
        openAlex: { transport: okTransport({ results: [] }), now: NOW },
        openLibrary: { transport: okTransport(openLibraryBody()), now: NOW },
        now: NOW,
      },
    );
    expect(result.items.every((i) => i.sources.every((s) => s.kind !== "seed"))).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it("seed 检索抛异常 → 不炸整个联邦（failures 带 seed unreachable）", async () => {
    const result = await federateSearch(
      { topic: "attention" },
      {
        openAlex: { transport: okTransport(openAlexBody()), now: NOW },
        openLibrary: { transport: okTransport({ docs: [] }), now: NOW },
        seedSearch: async () => {
          throw new Error("seed store corrupted");
        },
        now: NOW,
      },
    );
    expect(result.items.length).toBeGreaterThan(0); // OpenAlex 结果仍在
    expect(result.failures.some((f) => f.source === "seed")).toBe(true);
    expect(result.degraded).toBe(false);
  });

  it("默认 seedSearch 走 seedCatalogAdapter（真实本地检索，离线可用）", async () => {
    const result = await federateSearch(
      { topic: "强化学习" },
      {
        openAlex: { transport: okTransport({ results: [] }), now: NOW },
        openLibrary: { transport: failTransport(), now: NOW },
        now: NOW,
      },
    );
    // seed 源必须有产出或至少不崩；中文查询在 seed 里有匹配
    expect(result.items.some((i) => i.sources.some((s) => s.kind === "seed"))).toBe(true);
  });
});
