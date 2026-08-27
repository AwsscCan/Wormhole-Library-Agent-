/**
 * M2 跨源去重引擎测试 —— 纯函数、零网络。
 * 覆盖：归一化原语 / 精确键合并 / 标题层合并 / 年份约束 / 合并元数据 / 报告
 */

import { describe, expect, it } from "vitest";

import {
  createStableId,
  dedupeCandidates,
  firstAuthorSurname,
  normalizeDoi,
  normalizeIsbn,
  normalizeTitle,
  type DedupeCandidate,
} from "@/lib/federation/dedupe";
import type { SourceRef } from "@/lib/federation/types";

function src(
  kind: SourceRef["kind"],
  sourceId: string,
  retrievedAt = 1_700_000_000_000,
): SourceRef {
  const labels: Record<SourceRef["kind"], string> = {
    openalex: "OpenAlex",
    openlibrary: "Open Library",
    seed: "本地种子",
    user: "用户",
  };
  return { kind, label: labels[kind], sourceId, retrievedAt };
}

function cand(partial: Partial<DedupeCandidate> & { source: SourceRef }): DedupeCandidate {
  return {
    title: "Attention Is All You Need",
    authors: ["Ashish Vaswani"],
    year: 2017,
    ...partial,
  };
}

describe("归一化原语", () => {
  it("normalizeTitle：大小写/标点/语序无关", () => {
    expect(normalizeTitle("Attention Is ALL You Need")).toBe(
      normalizeTitle("attention is all you need"),
    );
    expect(normalizeTitle("Attention: Is All-You-Need!")).toBe(
      normalizeTitle("Is all you need attention"),
    );
  });

  it("normalizeTitle：空串与纯标点归一为空", () => {
    expect(normalizeTitle("")).toBe("");
    expect(normalizeTitle("!!! --- ???")).toBe("");
  });

  it("normalizeIsbn：去连字符/空格，x 大写", () => {
    expect(normalizeIsbn("978-0-262-03384-8")).toBe("9780262033848");
    expect(normalizeIsbn("0 262 03384 x")).toBe("026203384X");
  });

  it("normalizeDoi：剥 URL 前缀 + 小写", () => {
    expect(normalizeDoi("https://doi.org/10.1234/ABC.def")).toBe("10.1234/abc.def");
    expect(normalizeDoi("doi:10.1234/ABC.def")).toBe("10.1234/abc.def");
    expect(normalizeDoi("10.1234/ABC.def")).toBe("10.1234/abc.def");
  });

  it("firstAuthorSurname：支持 姓,名 与 名 姓 两种格式", () => {
    expect(firstAuthorSurname(["Smith, John"])).toBe("smith");
    expect(firstAuthorSurname(["John Smith"])).toBe("smith");
    expect(firstAuthorSurname([])).toBe("");
  });
});

describe("createStableId", () => {
  it("DOI 优先", () => {
    expect(
      createStableId({ doi: "https://doi.org/10.1/X", isbn: "978-0-262-03384-8", title: "t", authors: [] }),
    ).toBe("doi:10.1/x");
  });

  it("无 DOI 时 ISBN 次之", () => {
    expect(
      createStableId({ isbn: "978-0-262-03384-8", title: "t", authors: [] }),
    ).toBe("isbn:9780262033848");
  });

  it("标题 hash 对语序/大小写稳定", () => {
    const a = createStableId({ title: "Attention Is All You Need", authors: ["Ashish Vaswani"] });
    const b = createStableId({ title: "all you need is attention", authors: ["Vaswani, Ashish"] });
    expect(a).toBe(b);
    expect(a).toMatch(/^title:[0-9a-f]{8}$/);
  });

  it("不同作者 → 不同标题 hash", () => {
    const a = createStableId({ title: "Same Title", authors: ["A Author"] });
    const b = createStableId({ title: "Same Title", authors: ["B Writer"] });
    expect(a).not.toBe(b);
  });
});

describe("第一轮：精确键合并", () => {
  it("同 DOI 跨源合并，sources 全保留且按源优先级排序", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("seed", "s1"), doi: "10.1234/abc" }),
      cand({ source: src("openalex", "W123"), doi: "https://doi.org/10.1234/ABC" }),
      cand({ source: src("openlibrary", "OL1W"), doi: "doi:10.1234/abc" }),
    ]);
    expect(outcome.items).toHaveLength(1);
    const item = outcome.items[0];
    expect(item.sources.map((s) => s.kind)).toEqual([
      "openalex",
      "openlibrary",
      "seed",
    ]);
    expect(item.id).toBe("doi:10.1234/abc");
  });

  it("同 ISBN（连字符差异）合并", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openlibrary", "OL1"), isbn: "978-0-262-03384-8" }),
      cand({ source: src("seed", "s1"), isbn: "9780262033848" }),
    ]);
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0].id).toBe("isbn:9780262033848");
  });

  it("DOI 与 ISBN 不同键 → 不合并（即使标题相同）", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), doi: "10.1/x" }),
      cand({ source: src("openlibrary", "OL1"), isbn: "9780262033848" }),
    ]);
    expect(outcome.items).toHaveLength(2);
  });

  it("不同 DOI → 不合并", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), doi: "10.1/x" }),
      cand({ source: src("openalex", "W2"), doi: "10.1/y" }),
    ]);
    expect(outcome.items).toHaveLength(2);
  });
});

describe("第二轮：标题层合并（无精确键时）", () => {
  it("标题归一化全等 + 同作者姓 + 年份差 1 → 合并", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), year: 2017 }),
      cand({
        source: src("openlibrary", "OL1"),
        title: "attention is all you need",
        year: 2018,
      }),
    ]);
    expect(outcome.items).toHaveLength(1);
  });

  it("年份差 2 → 不合并（初版 vs 二版场景）", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), year: 1998 }),
      cand({
        source: src("openlibrary", "OL1"),
        title: "attention is all you need",
        year: 2020,
      }),
    ]);
    expect(outcome.items).toHaveLength(2);
  });

  it("首作者姓不同 → 不合并", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), authors: ["Ashish Vaswani"] }),
      cand({
        source: src("openlibrary", "OL1"),
        authors: ["Noam Shazeer"],
      }),
    ]);
    expect(outcome.items).toHaveLength(2);
  });

  it("一侧缺年份 → 允许合并（标题全等已是强条件）", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), year: 2017 }),
      cand({ source: src("openlibrary", "OL1"), year: null }),
    ]);
    expect(outcome.items).toHaveLength(1);
  });

  it("双方都无作者 → 标题全等即合并", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), authors: [] }),
      cand({
        source: src("seed", "s1"),
        authors: [],
        title: "ATTENTION IS ALL YOU NEED",
      }),
    ]);
    expect(outcome.items).toHaveLength(1);
  });

  it("精确键命中者不参与标题层（避免二次打散）", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), doi: "10.1/x", title: "Title A" }),
      cand({ source: src("openlibrary", "OL1"), doi: "10.1/x", title: "Title A" }),
      cand({ source: src("seed", "s1"), title: "Title A" }), // 无键，标题层独立
    ]);
    expect(outcome.items).toHaveLength(2);
  });
});

describe("合并元数据", () => {
  it("年份取首个非空、excerpt 取首个非空、url 取首个非空", () => {
    const outcome = dedupeCandidates([
      cand({
        source: src("seed", "s1", 1_000),
        year: null,
        doi: "10.1/x",
        excerpt: undefined,
        url: undefined,
      }),
      cand({
        source: src("openalex", "W1", 2_000),
        doi: "10.1/x",
        year: 2017,
        excerpt: "The dominant sequence transduction models...",
        url: "https://example.com/paper",
      }),
    ]);
    const item = outcome.items[0];
    expect(item.year).toBe(2017);
    expect(item.excerpt).toContain("sequence transduction");
    expect(item.url).toBe("https://example.com/paper");
    expect(item.retrievedAt).toBe(2_000);
  });

  it("标题/作者保留源优先级最高一方的（openalex > openlibrary > seed）", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("seed", "s1"), isbn: "9780262033848", title: "种子标题" }),
      cand({
        source: src("openalex", "W1"),
        isbn: "978-0-262-03384-8",
        title: "Deep Learning",
        authors: ["Ian Goodfellow"],
      }),
    ]);
    expect(outcome.items[0].title).toBe("Deep Learning");
    expect(outcome.items[0].authors).toEqual(["Ian Goodfellow"]);
  });
});

describe("DedupeReport（去重质量实验的数据源）", () => {
  it("三个源同 DOI → mergedCount=2，merges 一条含两个 absorbedId", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), doi: "10.1/x" }),
      cand({ source: src("openlibrary", "OL1"), doi: "10.1/x" }),
      cand({ source: src("seed", "s1"), doi: "10.1/x" }),
    ]);
    expect(outcome.report.inputCount).toBe(3);
    expect(outcome.report.outputCount).toBe(1);
    expect(outcome.report.mergedCount).toBe(2);
    expect(outcome.report.merges).toHaveLength(1);
    expect(outcome.report.merges[0].keptId).toBe("doi:10.1/x");
    expect(outcome.report.merges[0].absorbedIds).toEqual([
      "doi:10.1/x",
      "doi:10.1/x",
    ]);
  });

  it("空输入 → 空输出、零合并", () => {
    const outcome = dedupeCandidates([]);
    expect(outcome.items).toHaveLength(0);
    expect(outcome.report).toEqual({
      inputCount: 0,
      outputCount: 0,
      mergedCount: 0,
      merges: [],
    });
  });

  it("全部唯一 → mergedCount=0、merges 空", () => {
    const outcome = dedupeCandidates([
      cand({ source: src("openalex", "W1"), doi: "10.1/x" }),
      cand({ source: src("openalex", "W2"), doi: "10.1/y" }),
    ]);
    expect(outcome.report.mergedCount).toBe(0);
    expect(outcome.report.merges).toHaveLength(0);
  });
});
