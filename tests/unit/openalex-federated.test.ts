/**
 * M4 OpenAlex 联邦适配器测试 —— stub transport，零真实网络。
 * 核心：失败绝不静默回退（与 lib/catalog 版的最大区别）。
 */

import { describe, expect, it } from "vitest";

import { searchOpenAlexFederated } from "@/lib/federation/openAlexFederated";

const FIXED_NOW = 1_750_000_000_000;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const WORKS_FIXTURE = {
  results: [
    {
      id: "https://openalex.org/W2741809807",
      doi: "https://doi.org/10.5555/3295222.3295349",
      display_name: "Attention Is All You Need",
      publication_year: 2017,
      authorships: [
        { author: { display_name: "Ashish Vaswani" } },
        { author: { display_name: "Noam Shazeer" } },
      ],
    },
    {
      id: "https://openalex.org/W2963403868",
      display_name: "Deep Residual Learning for Image Recognition",
      publication_year: 2016,
      authorships: [{ author: { display_name: "Kaiming He" } }],
    },
  ],
};

describe("searchOpenAlexFederated 成功路径", () => {
  it("work → DedupeCandidate 正确映射（doi 剥前缀、sourceId 剥 https://openalex.org/）", async () => {
    const res = await searchOpenAlexFederated(
      { topic: "attention" },
      {
        transport: async () => jsonResponse(WORKS_FIXTURE),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.candidates).toHaveLength(2);
    const first = res.candidates[0];
    expect(first.title).toBe("Attention Is All You Need");
    expect(first.authors).toEqual(["Ashish Vaswani", "Noam Shazeer"]);
    expect(first.year).toBe(2017);
    expect(first.doi).toBe("10.5555/3295222.3295349");
    expect(first.source.kind).toBe("openalex");
    expect(first.source.sourceId).toBe("W2741809807");
    expect(first.source.retrievedAt).toBe(FIXED_NOW);
  });

  it("空 results → ok:true 空结果（合法无结果）", async () => {
    const res = await searchOpenAlexFederated(
      { topic: "zzz" },
      {
        transport: async () => jsonResponse({ results: [] }),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.candidates).toHaveLength(0);
  });

  it("空查询 → ok:true 空结果（不上报假 failure）", async () => {
    const res = await searchOpenAlexFederated(
      { topic: "   " },
      { transport: async () => jsonResponse({}), now: () => FIXED_NOW },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.candidates).toHaveLength(0);
  });

  it("URL 带 search/per-page/mailto（polite pool）", async () => {
    const urls: string[] = [];
    await searchOpenAlexFederated(
      { topic: "graph neural", limit: 25 },
      {
        transport: async (url) => {
          urls.push(url);
          return jsonResponse({ results: [] });
        },
        now: () => FIXED_NOW,
      },
    );
    expect(urls[0]).toContain("search=graph%20neural");
    expect(urls[0]).toContain("per-page=25");
    expect(urls[0]).toContain("mailto=");
  });

  it("无 display_name 的脏 work 被丢弃", async () => {
    const res = await searchOpenAlexFederated(
      { topic: "a" },
      {
        transport: async () =>
          jsonResponse({
            results: [{ id: "https://openalex.org/W1" }, { id: "https://openalex.org/W2", display_name: "" }],
          }),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.candidates).toHaveLength(0);
  });
});

describe("searchOpenAlexFederated 失败路径（绝不静默回退）", () => {
  it("网络拒绝 → unreachable + source=openalex（不吞、不回退 seed）", async () => {
    const res = await searchOpenAlexFederated(
      { topic: "a" },
      {
        transport: async () => {
          throw new TypeError("fetch failed");
        },
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).toBe("unreachable");
    expect(res.failure.source).toBe("openalex");
  });

  it("429 + Retry-After → rate_limited 带 retryAfterMs", async () => {
    const res = await searchOpenAlexFederated(
      { topic: "a" },
      {
        transport: async () =>
          jsonResponse({ error: "rate" }, 429, { "retry-after": "2" }),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).toBe("rate_limited");
    if (res.failure.kind === "rate_limited") {
      expect(res.failure.retryAfterMs).toBe(2000);
    }
  });

  it("503 → unreachable 服务端错误", async () => {
    const res = await searchOpenAlexFederated(
      { topic: "a" },
      {
        transport: async () => jsonResponse({}, 503),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).toBe("unreachable");
  });

  it("超时中断 → unreachable + 超时措辞", async () => {
    const res = await searchOpenAlexFederated(
      { topic: "a" },
      {
        timeoutMs: 30,
        transport: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).toBe("unreachable");
    if (res.failure.kind === "unreachable") {
      expect(res.failure.message).toContain("超时");
    }
  });

  it("非 JSON 响应 → parse_error", async () => {
    const res = await searchOpenAlexFederated(
      { topic: "a" },
      {
        transport: async () => new Response("not json", { status: 200 }),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).toBe("parse_error");
    expect(res.failure.source).toBe("openalex");
  });
});
