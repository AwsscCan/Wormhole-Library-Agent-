/**
 * 来源透明目录端口 adapter 契约测试（package 02 → package 05）。
 *
 * 覆盖验收报告 F-001 / F-002：
 *  - EvidenceItem → SourceTransparentResource 投影（ResourceCard 必填字段 + 主/附加 provenance）
 *  - success / empty / failed / disabled 状态矩阵
 *  - live / partial / unavailable 汇总
 *  - all-empty、部分失败但 seed 命中、全部不可用
 *  - 绑定后 package 05 经 queryTopicLibrary() 拿到真实结果
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  bindSourceTransparentCatalogAdapter,
  createSourceTransparentCatalogAdapter,
  toSourceTransparentResource,
} from "@/lib/federation/catalogPortAdapter";
import { clearPackage02SourceCatalogPortForTests, queryTopicLibrary } from "@/lib/research/catalogPort";
import type { ResourceCard } from "@/lib/types";
import type { EvidenceItem } from "@/lib/federation/types";

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

const DOI = "10.5555/3295222.3295349";

function openAlexBody(): unknown {
  return {
    results: [
      {
        id: "https://openalex.org/W2741809807",
        doi: `https://doi.org/${DOI}`,
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
        doi: [DOI],
      },
    ],
  };
}

function seedCards(): ResourceCard[] {
  return [
    {
      id: "seed:rl-101",
      type: "paper",
      title: "强化学习入门",
      authors: ["某人"],
      language: "zh",
      why: "seed",
      availability: "online",
      difficulty: "undergrad",
      concepts: [],
      qualityScore: 0.5,
    },
  ];
}

const SEED = async () => seedCards();

function statusOf(sources: { kind: string; status: string }[] | undefined, kind: string): string | undefined {
  return sources?.find((s) => s.kind === kind)?.status;
}

describe("toSourceTransparentResource projection", () => {
  it("projects a multi-source EvidenceItem into a ResourceCard + primary/additional provenance", () => {
    const item: EvidenceItem = {
      id: `doi:${DOI}`,
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani"],
      year: 2017,
      excerpt: "The transformer architecture.",
      sources: [
        { kind: "openalex", label: "OpenAlex", sourceId: "W2741809807", retrievedAt: FIXED_NOW },
        { kind: "openlibrary", label: "Open Library", sourceId: "OL45804W", retrievedAt: FIXED_NOW },
      ],
      retrievedAt: FIXED_NOW,
      doi: DOI,
    };

    const resource = toSourceTransparentResource(item);

    // ResourceCard 必填字段全部就位
    expect(resource.id).toBe(`doi:${DOI}`);
    expect(resource.type).toBe("paper");
    expect(resource.title).toBe("Attention Is All You Need");
    expect(resource.authors).toEqual(["Ashish Vaswani"]);
    expect(resource.year).toBe(2017);
    expect(resource.language).toBe("en");
    expect(resource.why).toBeTruthy();
    expect(resource.availability).toBe("online");
    expect(resource.difficulty).toBe("research");
    expect(resource.concepts).toEqual([]);
    expect(resource.qualityScore).toBe(0.9);

    // 主 provenance 是优先级最高的 openalex
    expect(resource.provenance.sourceKind).toBe("openalex");
    expect(resource.provenance.sourceLabel).toBe("OpenAlex");
    expect(resource.provenance.externalId).toBe("W2741809807");
    // 附加来源诚实列出
    expect(resource.additionalProvenance?.map((p) => p.sourceKind)).toEqual(["openlibrary"]);
  });

  it("infers zh language from a Chinese title", () => {
    const resource = toSourceTransparentResource({
      id: "seed:x", title: "强化学习导论", authors: [], year: null,
      sources: [{ kind: "seed", label: "本地种子", sourceId: "s1", retrievedAt: FIXED_NOW }],
      retrievedAt: FIXED_NOW,
    });
    expect(resource.language).toBe("zh");
    expect(resource.provenance.sourceKind).toBe("seed");
  });
});

describe("searchTopic source status matrix", () => {
  it("all sources success → live, degraded=false, resources non-empty", async () => {
    const adapter = createSourceTransparentCatalogAdapter({
      federate: {
        includeOpenAlex: true,
        includeOpenLibrary: true,
        openAlex: { transport: okTransport(openAlexBody()), now: NOW },
        openLibrary: { transport: okTransport(openLibraryBody()), now: NOW },
        seedSearch: SEED,
        now: NOW,
      },
    });
    const result = await adapter.searchTopic({ query: "attention", limit: 12 });
    expect(result.sourceStatus).toBe("live");
    expect(result.degraded).toBe(false);
    expect(result.resources.length).toBeGreaterThan(0);
    // 三个源都是 success
    expect(statusOf(result.sources, "openalex")).toBe("success");
    expect(statusOf(result.sources, "openlibrary")).toBe("success");
    expect(statusOf(result.sources, "seed")).toBe("success");
  });

  it("all sources empty → live with 0 resources and an honest message", async () => {
    const adapter = createSourceTransparentCatalogAdapter({
      federate: {
        includeOpenAlex: true,
        includeOpenLibrary: true,
        openAlex: { transport: okTransport({ results: [] }), now: NOW },
        openLibrary: { transport: okTransport({ docs: [] }), now: NOW },
        seedSearch: async () => [],
        now: NOW,
      },
    });
    const result = await adapter.searchTopic({ query: "nothing", limit: 12 });
    expect(result.resources).toHaveLength(0);
    expect(result.sourceStatus).toBe("live");
    expect(result.degraded).toBe(false);
    expect(result.message).toContain("没有找到");
    // 空结果是"empty"，不是"failed"
    expect(statusOf(result.sources, "openalex")).toBe("empty");
    expect(statusOf(result.sources, "openlibrary")).toBe("empty");
    expect(statusOf(result.sources, "seed")).toBe("empty");
  });

  it("partial: remote sources fail but seed hits → partial, degraded=true, seed resources returned", async () => {
    const adapter = createSourceTransparentCatalogAdapter({
      federate: {
        includeOpenAlex: true,
        includeOpenLibrary: true,
        openAlex: { transport: failTransport(), now: NOW },
        openLibrary: { transport: failTransport(), now: NOW },
        seedSearch: SEED,
        now: NOW,
      },
    });
    const result = await adapter.searchTopic({ query: "强化学习", limit: 12 });
    expect(result.sourceStatus).toBe("partial");
    expect(result.degraded).toBe(true);
    expect(result.resources.length).toBeGreaterThan(0);
    expect(result.resources.every((r) => r.provenance.sourceKind === "seed")).toBe(true);
    expect(statusOf(result.sources, "openalex")).toBe("failed");
    expect(statusOf(result.sources, "openlibrary")).toBe("failed");
    expect(statusOf(result.sources, "seed")).toBe("success");
  });

  it("all sources unavailable → unavailable, degraded=true, no fabricated results", async () => {
    const adapter = createSourceTransparentCatalogAdapter({
      federate: {
        includeOpenAlex: true,
        includeOpenLibrary: true,
        openAlex: { transport: failTransport(), now: NOW },
        openLibrary: { transport: failTransport(), now: NOW },
        seedSearch: async () => {
          throw new Error("seed store corrupted");
        },
        now: NOW,
      },
    });
    const result = await adapter.searchTopic({ query: "RAG", limit: 12 });
    expect(result.sourceStatus).toBe("unavailable");
    expect(result.degraded).toBe(true);
    expect(result.resources).toHaveLength(0);
    expect(result.message).toContain("不可用");
    expect(statusOf(result.sources, "openalex")).toBe("failed");
    expect(statusOf(result.sources, "openlibrary")).toBe("failed");
    expect(statusOf(result.sources, "seed")).toBe("failed");
  });

  it("disabled sources are recorded as disabled and excluded from availability", async () => {
    const adapter = createSourceTransparentCatalogAdapter({
      federate: {
        includeOpenAlex: false,
        includeOpenLibrary: false,
        seedSearch: SEED,
        now: NOW,
      },
    });
    const result = await adapter.searchTopic({ query: "强化学习", limit: 12 });
    expect(statusOf(result.sources, "openalex")).toBe("disabled");
    expect(statusOf(result.sources, "openlibrary")).toBe("disabled");
    expect(statusOf(result.sources, "seed")).toBe("success");
    // 唯一启用的源成功了 → live
    expect(result.sourceStatus).toBe("live");
    expect(result.degraded).toBe(false);
  });
});

describe("composition binding", () => {
  afterEach(() => clearPackage02SourceCatalogPortForTests());

  it("bindSourceTransparentCatalogAdapter makes queryTopicLibrary serve real results", async () => {
    // 未绑定时 package 05 显式降级
    await expect(queryTopicLibrary({ query: "attention" })).resolves.toMatchObject({ sourceStatus: "unavailable" });

    bindSourceTransparentCatalogAdapter({
      federate: {
        includeOpenAlex: true,
        includeOpenLibrary: true,
        openAlex: { transport: okTransport(openAlexBody()), now: NOW },
        openLibrary: { transport: okTransport({ docs: [] }), now: NOW },
        seedSearch: async () => [],
        now: NOW,
      },
    });

    const result = await queryTopicLibrary({ query: "attention", limit: 12 });
    expect(result.sourceStatus).toBe("live");
    expect(result.resources.length).toBeGreaterThan(0);
    expect(result.resources[0].provenance.sourceKind).toBe("openalex");
  });
});
