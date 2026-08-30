/**
 * M3 Open Library 适配器测试 —— stub transport，零真实网络。
 * fixture 形状对齐 openlibrary.org/search.json 真实响应结构。
 */

import { describe, expect, it } from "vitest";

import { searchOpenLibrary } from "@/lib/federation/openLibraryAdapter";

const FIXED_NOW = 1_750_000_000_000;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const FIXTURE_DOCS = {
  numFound: 2,
  start: 0,
  docs: [
    {
      key: "/works/OL45804W",
      title: "The Master Algorithm",
      author_name: ["Pedro Domingos"],
      first_publish_year: 2015,
      isbn: ["9780465065707", "0465065708"],
      doi: ["10.1/malgo"],
    },
    {
      key: "/works/OL7351977M",
      title: "Deep Learning",
      author_name: ["Ian Goodfellow", "Yoshua Bengio", "Aaron Courville"],
      first_publish_year: 2016,
      isbn: ["9780262035613"],
    },
  ],
};

describe("searchOpenLibrary 成功路径", () => {
  it("doc → DedupeCandidate 正确映射（workId 剥前缀/首个 isbn/doi）", async () => {
    const urls: string[] = [];
    const res = await searchOpenLibrary(
      { topic: "machine learning" },
      {
        transport: async (url) => {
          urls.push(url);
          return jsonResponse(FIXTURE_DOCS);
        },
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.candidates).toHaveLength(2);

    const first = res.candidates[0];
    expect(first.title).toBe("The Master Algorithm");
    expect(first.authors).toEqual(["Pedro Domingos"]);
    expect(first.year).toBe(2015);
    expect(first.isbn).toBe("9780465065707");
    expect(first.doi).toBe("10.1/malgo");
    expect(first.source.kind).toBe("openlibrary");
    expect(first.source.label).toBe("Open Library");
    expect(first.source.sourceId).toBe("OL45804W");
    expect(first.source.retrievedAt).toBe(FIXED_NOW);

    // URL：q 编码 + limit 默认 12 + fields 收窄
    expect(urls[0]).toContain("q=machine%20learning");
    expect(urls[0]).toContain("limit=12");
    expect(urls[0]).toContain("fields=key,title,author_name,first_publish_year,isbn,doi");
  });

  it("无标题的脏 doc 被丢弃，不编造条目", async () => {
    const res = await searchOpenLibrary(
      { topic: "x" },
      {
        transport: async () =>
          jsonResponse({
            docs: [{ key: "/works/OL1W" }, { key: "/works/OL2W", title: "  " }],
          }),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.candidates).toHaveLength(0);
  });

  it("docs 缺失/空数组 → ok:true 空结果（合法无结果，不是失败）", async () => {
    for (const body of [{}, { docs: [] }, { numFound: 0 }]) {
      const res = await searchOpenLibrary(
        { topic: "nothing" },
        { transport: async () => jsonResponse(body), now: () => FIXED_NOW },
      );
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.candidates).toHaveLength(0);
    }
  });

  it("limit 边界：0/负数夹到 1，超过 100 夹到 100", async () => {
    const urls: string[] = [];
    const transport = async (url: string) => {
      urls.push(url);
      return jsonResponse({ docs: [] });
    };
    await searchOpenLibrary({ topic: "a", limit: 0 }, { transport });
    await searchOpenLibrary({ topic: "a", limit: -5 }, { transport });
    await searchOpenLibrary({ topic: "a", limit: 500 }, { transport });
    expect(urls[0]).toContain("limit=1");
    expect(urls[1]).toContain("limit=1");
    expect(urls[2]).toContain("limit=100");
  });
});

describe("searchOpenLibrary 失败路径（不撒谎降级）", () => {
  it("429 + Retry-After: 5 → rate_limited, retryAfterMs=5000", async () => {
    const res = await searchOpenLibrary(
      { topic: "a" },
      {
        transport: async () =>
          jsonResponse({ error: "too many" }, 429, { "retry-after": "5" }),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).toBe("rate_limited");
    if (res.failure.kind === "rate_limited") {
      expect(res.failure.retryAfterMs).toBe(5000);
      expect(res.failure.source).toBe("openlibrary");
    }
  });

  it("500 → unreachable + 服务端错误措辞", async () => {
    const res = await searchOpenLibrary(
      { topic: "a" },
      {
        transport: async () => jsonResponse({ error: "boom" }, 500),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).toBe("unreachable");
    if (res.failure.kind === "unreachable") {
      expect(res.failure.message).toContain("HTTP 500");
    }
  });

  it("404 → parse_error + body 摘要", async () => {
    const res = await searchOpenLibrary(
      { topic: "a" },
      {
        transport: async () => jsonResponse({ error: "not found" }, 404),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).toBe("parse_error");
    if (res.failure.kind === "parse_error") {
      expect(res.failure.body).toContain("not found");
    }
  });

  it("网络层拒绝（fetch failed）→ unreachable，不返回部分数据", async () => {
    const res = await searchOpenLibrary(
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
    expect(res.failure.source).toBe("openlibrary");
  });

  it("超时中断（AbortError）→ unreachable + 超时措辞", async () => {
    const res = await searchOpenLibrary(
      { topic: "a" },
      {
        timeoutMs: 30,
        transport: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("This operation was aborted");
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

  it("响应体不是 JSON → parse_error", async () => {
    const res = await searchOpenLibrary(
      { topic: "a" },
      {
        transport: async () =>
          new Response("<html>gateway error</html>", { status: 200 }),
        now: () => FIXED_NOW,
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).toBe("parse_error");
    expect(res.failure.source).toBe("openlibrary");
  });
});
