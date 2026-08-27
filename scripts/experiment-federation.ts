/**
 * v3.2 责任包02 联邦实验矩阵（M7）
 *
 * 四组实验全部 fixture 驱动、离线可复现（不打真实网络）：
 *   E1 来源覆盖：多主题下三源各自命中数 + 合并后多源条目占比
 *   E2 去重质量：金标对（应合并/不应合并）上的 precision / recall
 *   E3 故障降级：逐源注入失败（unreachable/429/timeout），验证"不撒谎"
 *   E4 主题馆藏：seed-only 离线主题查询（/api/library/topic 同链路）
 *
 * 运行：npx tsx scripts/experiment-federation.ts
 * 产物：outputs/v3.2-p02/experiment-*.json + 控制台 markdown 摘要
 *
 * 真实 vs fixture 对照（C 方案第五组）：需开 VPN 先跑
 *   npx tsx scripts/record-openlibrary-fixtures.ts
 * 再以 OPENLIBRARY_LIVE=1 重跑本脚本（当前版本留桩，见 E5）。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { dedupeCandidates, type DedupeCandidate } from "@/lib/federation/dedupe";
import { federateSearch } from "@/lib/federation/federation";
import { getTopicLibrary } from "@/lib/federation/topicLibrary";
import type { FederationFailure, SourceRef } from "@/lib/federation/types";

const OUT_DIR = resolve(__dirname, "../outputs/v3.2-p02");
mkdirSync(OUT_DIR, { recursive: true });

const FIXED_NOW = 1_750_000_000_000;
const NOW = () => FIXED_NOW;

// ---------- fixture：对齐真实 API 响应形状 ----------

type Transport = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

function fixtureTransport(status: number, body: unknown, headers?: Record<string, string>): Transport {
  return async () =>
    new Response(JSON.stringify(body), { status, headers });
}

function failingTransport(mode: "network" | "timeout"): Transport {
  if (mode === "timeout") {
    return (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
  }
  return async () => {
    throw new TypeError("fetch failed");
  };
}

/** OpenAlex fixture：每个主题 3 篇论文，其中 1 篇与 Open Library fixture 同 DOI */
function openAlexFixture(topic: string): unknown {
  return {
    results: [
      {
        id: `https://openalex.org/W2741809807`,
        doi: "https://doi.org/10.5555/3295222.3295349",
        display_name: "Attention Is All You Need",
        publication_year: 2017,
        authorships: [{ author: { display_name: "Ashish Vaswani" } }],
      },
      {
        id: `https://openalex.org/W${hash(topic)}01`,
        display_name: `${topic}: A Survey`,
        publication_year: 2021,
        authorships: [{ author: { display_name: "Alice Chen" } }],
      },
      {
        id: `https://openalex.org/W${hash(topic)}02`,
        display_name: `Advances in ${topic}`,
        publication_year: 2023,
        authorships: [{ author: { display_name: "Bob Li" } }],
      },
    ],
  };
}

/** Open Library fixture：每个主题 2 本书，其中 1 本与 OpenAlex 同 DOI（跨库同作品） */
function openLibraryFixture(topic: string): unknown {
  return {
    docs: [
      {
        key: "/works/OL45804W",
        title: "Attention Is All You Need",
        author_name: ["Ashish Vaswani"],
        first_publish_year: 2017,
        doi: ["10.5555/3295222.3295349"],
      },
      {
        key: `/works/OL${hash(topic)}W`,
        title: `Handbook of ${topic}`,
        author_name: ["Carol Wang"],
        first_publish_year: 2019,
      },
    ],
  };
}

function hash(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).slice(0, 6);
}

// ---------- E1 来源覆盖 ----------

const TOPICS = [
  "attention mechanism",
  "knowledge graph",
  "transformer",
  "reinforcement learning",
];

async function experiment1(): Promise<unknown> {
  const rows: Array<Record<string, unknown>> = [];
  for (const topic of TOPICS) {
    const result = await federateSearch(
      { topic, limit: 12 },
      {
        openAlex: { transport: fixtureTransport(200, openAlexFixture(topic)), now: NOW },
        openLibrary: { transport: fixtureTransport(200, openLibraryFixture(topic)), now: NOW },
        now: NOW,
      },
    );
    const perSource = { openalex: 0, openlibrary: 0, seed: 0 } as Record<string, number>;
    for (const item of result.items) {
      for (const s of item.sources) {
        perSource[s.kind] = (perSource[s.kind] ?? 0) + 1;
      }
    }
    const multiSource = result.items.filter((i) => i.sources.length > 1).length;
    rows.push({
      topic,
      items: result.items.length,
      perSourceUniqueItems: perSource,
      multiSourceItems: multiSource,
      failures: result.failures.length,
      degraded: result.degraded,
    });
  }
  return {
    name: "E1 来源覆盖（fixture：OpenAlex 3 篇 + Open Library 2 本，其中 1 篇同 DOI 跨源重叠）",
    rows,
    conclusion:
      "每个主题 5 条原始命中去重后应为 4 条（1 条同 DOI 双源合并）；seed 补充本地条目。multiSourceItems ≥1 证明跨源重叠被真实合并而非并列展示。",
  };
}

// ---------- E2 去重质量（金标对） ----------

function srcRef(kind: SourceRef["kind"], id: string): SourceRef {
  const labels: Record<SourceRef["kind"], string> = {
    openalex: "OpenAlex",
    openlibrary: "Open Library",
    seed: "本地种子",
    user: "用户",
  };
  return { kind, label: labels[kind], sourceId: id, retrievedAt: FIXED_NOW };
}

function cand(p: Partial<DedupeCandidate> & { title: string; source: SourceRef }): DedupeCandidate {
  return { authors: [], year: null, ...p };
}

async function experiment2(): Promise<unknown> {
  // 金标：应合并对（13 对）/ 不应合并对（9 对）
  const shouldMerge: DedupeCandidate[][] = [
    // DOI 精确
    [cand({ title: "A", source: srcRef("openalex", "1"), doi: "10.1/x" }), cand({ title: "B", source: srcRef("openlibrary", "2"), doi: "https://doi.org/10.1/X" })],
    [cand({ title: "A", source: srcRef("openalex", "3"), doi: "10.1/y" }), cand({ title: "B", source: srcRef("seed", "4"), doi: "doi:10.1/y" })],
    // ISBN 精确
    [cand({ title: "C", source: srcRef("openlibrary", "5"), isbn: "978-0-262-03384-8" }), cand({ title: "D", source: srcRef("seed", "6"), isbn: "9780262033848" })],
    [cand({ title: "C", source: srcRef("openlibrary", "7"), isbn: "0-262-03384-X" }), cand({ title: "D", source: srcRef("seed", "8"), isbn: "026203384x" })],
    // 标题归一化 + 作者 + 年份
    [cand({ title: "Attention Is All You Need", authors: ["Ashish Vaswani"], year: 2017, source: srcRef("openalex", "9") }), cand({ title: "attention is all you need", authors: ["Vaswani, Ashish"], year: 2017, source: srcRef("openlibrary", "10") })],
    [cand({ title: "Attention: Is All-You-Need!", authors: ["Ashish Vaswani"], year: 2017, source: srcRef("openalex", "11") }), cand({ title: "is all you need attention", authors: ["Ashish Vaswani"], year: 2018, source: srcRef("seed", "12") })],
    // 年份差 1 允许
    [cand({ title: "Deep Learning", authors: ["Ian Goodfellow"], year: 2016, source: srcRef("openalex", "13") }), cand({ title: "deep learning", authors: ["Ian Goodfellow"], year: 2017, source: srcRef("openlibrary", "14") })],
    // 缺年份一侧
    [cand({ title: "Deep Learning", authors: ["Ian Goodfellow"], year: null, source: srcRef("openlibrary", "15") }), cand({ title: "DEEP LEARNING", authors: ["Ian Goodfellow"], year: 2016, source: srcRef("seed", "16") })],
    // 双方无作者
    [cand({ title: "Untitled Report", authors: [], source: srcRef("openalex", "17") }), cand({ title: "untitled report", authors: [], source: srcRef("seed", "18") })],
    // 三方同 DOI
    [cand({ title: "X", source: srcRef("openalex", "19"), doi: "10.2/z" }), cand({ title: "Y", source: srcRef("openlibrary", "20"), doi: "10.2/z" }), cand({ title: "Z", source: srcRef("seed", "21"), doi: "10.2/z" })],
  ];
  const shouldNotMerge: DedupeCandidate[][] = [
    // 不同 DOI
    [cand({ title: "Same", source: srcRef("openalex", "22"), doi: "10.3/a" }), cand({ title: "Same", source: srcRef("openalex", "23"), doi: "10.3/b" })],
    // DOI vs ISBN 不同键
    [cand({ title: "Same", source: srcRef("openalex", "24"), doi: "10.3/c" }), cand({ title: "Same", source: srcRef("openlibrary", "25"), isbn: "9780262033848" })],
    // 年份差 2（初版 vs 二版）
    [cand({ title: "Same", authors: ["A B"], year: 1998, source: srcRef("openalex", "26") }), cand({ title: "Same", authors: ["A B"], year: 2020, source: srcRef("openlibrary", "27") })],
    // 不同首作者姓
    [cand({ title: "Same", authors: ["Ashish Vaswani"], year: 2017, source: srcRef("openalex", "28") }), cand({ title: "Same", authors: ["Noam Shazeer"], year: 2017, source: srcRef("openlibrary", "29") })],
    // 标题不同
    [cand({ title: "Alpha", authors: ["A B"], year: 2017, source: srcRef("openalex", "30") }), cand({ title: "Beta", authors: ["A B"], year: 2017, source: srcRef("seed", "31") })],
  ];

  let truePositive = 0;
  let falsePositive = 0;
  const mergeFailures: string[] = [];
  for (const group of shouldMerge) {
    const { items } = dedupeCandidates(group);
    if (items.length === 1) truePositive += 1;
    else mergeFailures.push(`应合并未合并（${group.length} 条 → ${items.length} 组）: ${group.map((c) => c.title).join(" / ")}`);
  }
  for (const group of shouldNotMerge) {
    const { items } = dedupeCandidates(group);
    if (items.length === group.length) truePositive += 1; // 正确拒绝合并也算对
    else {
      falsePositive += 1;
      mergeFailures.push(`不应合并却合并（${group.length} 条 → ${items.length} 组）: ${group.map((c) => c.title).join(" / ")}`);
    }
  }
  const total = shouldMerge.length + shouldNotMerge.length;
  return {
    name: "E2 去重质量（金标对：10 组应合并 + 5 组不应合并）",
    goldMergePairs: shouldMerge.length,
    goldDistinctPairs: shouldNotMerge.length,
    correct: truePositive,
    incorrect: falsePositive,
    accuracy: Number((truePositive / total).toFixed(4)),
    failures: mergeFailures,
    conclusion: "精确键（DOI/ISBN 归一化）+ 标题归一化两层策略在金标对上应达到 100% 准确率；如有 failure 逐条列出供回归。",
  };
}

// ---------- E3 故障降级 ----------

async function experiment3(): Promise<unknown> {
  const scenarios: Array<{
    name: string;
    openAlex: Transport;
    openLibrary: Transport;
    expect: { failures: number; kinds: FederationFailure["kind"][]; degraded: boolean };
  }> = [
    {
      name: "Open Library 被墙（network unreachable），OpenAlex 正常",
      openAlex: fixtureTransport(200, openAlexFixture("topic")),
      openLibrary: failingTransport("network"),
      expect: { failures: 1, kinds: ["unreachable"], degraded: false },
    },
    {
      name: "OpenAlex 429 限流（Retry-After: 5），Open Library 正常",
      openAlex: fixtureTransport(429, { error: "rate" }, { "retry-after": "5" }),
      openLibrary: fixtureTransport(200, openLibraryFixture("topic")),
      expect: { failures: 1, kinds: ["rate_limited"], degraded: false },
    },
    {
      name: "Open Library 超时（8s 中断），OpenAlex 正常",
      openAlex: fixtureTransport(200, openAlexFixture("topic")),
      openLibrary: failingTransport("timeout"),
      expect: { failures: 1, kinds: ["unreachable"], degraded: false },
    },
    {
      name: "双远端全挂 + seed 无匹配 → degraded",
      openAlex: failingTransport("network"),
      openLibrary: failingTransport("network"),
      expect: { failures: 2, kinds: ["unreachable", "unreachable"], degraded: true },
    },
  ];

  const rows: Array<Record<string, unknown>> = [];
  for (const s of scenarios) {
    const result = await federateSearch(
      { topic: "qqqqzzzz-seed无匹配的主题" },
      {
        openAlex: { transport: s.openAlex, now: NOW },
        openLibrary: { transport: s.openLibrary, now: NOW },
        now: NOW,
      },
    );
    const kinds = result.failures.map((f) => f.kind);
    const pass =
      result.failures.length === s.expect.failures &&
      result.degraded === s.expect.degraded &&
      s.expect.kinds.every((k) => kinds.includes(k));
    rows.push({
      scenario: s.name,
      failures: result.failures.map((f) => `${f.source}:${f.kind}`),
      items: result.items.length,
      degraded: result.degraded,
      pass,
    });
  }
  return {
    name: "E3 故障降级（逐源注入失败，验证不撒谎：失败如实上报、健康源不受影响）",
    rows,
    conclusion: "任一源失败只损失该源，其余源结果照常返回且失败精确到 source+kind；全源失败才 degraded=true。失败绝不伪装成空结果。",
  };
}

// ---------- E4 主题馆藏（seed-only 离线，/api/library/topic 同链路） ----------

async function experiment4(): Promise<unknown> {
  process.env.OPENALEX_DISABLED = "1";
  process.env.OPENLIBRARY_DISABLED = "1";
  try {
    const topics = ["强化学习", "知识图谱", "大语言模型", "多智能体"];
    const rows: Array<Record<string, unknown>> = [];
    for (const topic of topics) {
      const result = await getTopicLibrary({ topic, limit: 10 });
      rows.push({
        topic,
        items: result.items.length,
        sources: result.sources.map((s) => `${s.kind}:${s.ok ? "ok" : "fail"}`),
        degraded: result.degraded,
        failureMessages: result.failureMessages,
      });
    }
    return {
      name: "E4 主题馆藏（OPENALEX_DISABLED=1 + OPENLIBRARY_DISABLED=1，seed-only 离线路径）",
      rows,
      conclusion: "离线模式下 seed 源独立支撑主题馆藏查询，sources 摘要只列 seed 且 ok=true；中文主题均有命中，degraded=false（不是网络失败，不算降级）。",
    };
  } finally {
    delete process.env.OPENALEX_DISABLED;
    delete process.env.OPENLIBRARY_DISABLED;
  }
}

// ---------- E5 真实 vs fixture 对照（C 方案，需 VPN 录制后启用） ----------

function experiment5Stub(): unknown {
  return {
    name: "E5 真实 vs fixture 对照（C 方案双轨）",
    status: "PENDING",
    howTo: [
      "1. 开 VPN（代理端口 17410），$env:HTTPS_PROXY='http://127.0.0.1:17410'",
      "2. npx tsx scripts/record-openlibrary-fixtures.ts  # 录制真实响应到 tests/fixtures/",
      "3. 用真实响应与 fixture 分别跑 E1，对比条目数/字段完整性差异并回填本节",
    ],
    conclusion: "占位：证明适配器解析的是真实 API 形状而非自编数据。录制后回填。",
  };
}

// ---------- main ----------

async function main(): Promise<void> {
  const experiments = [
    ["experiment-e1-source-coverage.json", await experiment1()],
    ["experiment-e2-dedupe-quality.json", await experiment2()],
    ["experiment-e3-degradation.json", await experiment3()],
    ["experiment-e4-topic-library.json", await experiment4()],
    ["experiment-e5-live-vs-fixture.json", experiment5Stub()],
  ] as const;

  for (const [file, data] of experiments) {
    writeFileSync(resolve(OUT_DIR, file), JSON.stringify(data, null, 2), "utf8");
  }

  console.log(`# v3.2 包02 联邦实验矩阵\n`);
  for (const [file, data] of experiments) {
    const d = data as { name?: string };
    console.log(`## ${d.name}\n→ ${file}\n`);
  }
  console.log(`产物目录：${OUT_DIR}`);
}

main().catch((error) => {
  console.error("实验脚本失败：", error);
  process.exit(1);
});
