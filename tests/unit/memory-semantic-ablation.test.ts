/**
 * Package 04 真实语义检索消融（验收报告 F-003 / E-003）。
 *
 * 默认语义路径是真实向量 provider（本地 Ollama 嵌入模型）。本测试通过 **mock
 * Ollama HTTP 层**（`fetchImpl`）模拟嵌入模型返回「语义相近词 → 相近向量」的
 * 输出，验证默认 provider 链路能召回无 token 重叠的真同义（car→automobile、
 * 车辆→汽车），并验证 Ollama 不可用时**明确降级**到字符 n-gram（而非冒充语义）。
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  addMemorySnippet,
  createSemanticEmbedder,
  getSemanticEmbedderStatus,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  resetSemanticEmbedderForTests,
  searchPrivateMemory,
  setSemanticEmbedderForTests,
} from "@/lib/research/memory";

const DIM = 32;

/** 模拟真实嵌入模型：把语义相近的词映射到同一 basis 维度。 */
const CLASSES: Record<string, number> = {
  car: 0, automobile: 0, vehicle: 0,
  汽车: 1, 车辆: 1,
  maintenance: 2, servicing: 2, repair: 2,
  维护: 3, 保养: 3,
};

function classOf(token: string): number {
  if (token in CLASSES) return CLASSES[token];
  let h = 0;
  for (let i = 0; i < token.length; i += 1) h = (h * 31 + token.charCodeAt(i)) >>> 0;
  return 4 + (h % (DIM - 4));
}

function semanticVector(text: string): number[] {
  const vec = new Array(DIM).fill(0);
  const norm = text.toLowerCase();
  for (const word of norm.split(/[^a-z0-9]+/).filter((w) => w.length > 1)) vec[classOf(word)] += 1;
  const cjk = norm.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const seg of cjk) for (let i = 0; i < seg.length - 1; i += 1) vec[classOf(seg.slice(i, i + 2))] += 1;
  const len = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return len ? vec.map((v) => v / len) : vec;
}

/** Mock Ollama `/api/embed`：返回语义向量。 */
function mockOllamaFetch(): typeof fetch {
  return (async (url: string, init?: { body?: string }) => {
    if (!String(url).endsWith("/api/embed")) {
      return new Response("not found", { status: 404 });
    }
    const body = JSON.parse(init?.body ?? "{}") as { input?: string };
    return new Response(JSON.stringify({ embeddings: [semanticVector(body.input ?? "")] }), { status: 200 });
  }) as typeof fetch;
}

function mockOllamaDownFetch(): typeof fetch {
  return (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
}

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
  resetSemanticEmbedderForTests();
});

describe("default semantic path (real embedding provider)", () => {
  it("recalls a true English synonym with no token or character overlap (car servicing → automobile maintenance)", async () => {
    setSemanticEmbedderForTests(createSemanticEmbedder({ useOllama: true, fetchImpl: mockOllamaFetch() }));
    await addMemorySnippet({
      ownerId: "member:alice", sessionId: "s1", sourceId: "ev-car", kind: "note",
      text: "automobile maintenance",
    });

    // 词面（token）层完全无重叠 → lexical-only 为空
    const lexical = await searchPrivateMemory({ ownerId: "member:alice", query: "car servicing", limit: 5, mode: "lexical-only" });
    expect(lexical).toHaveLength(0);

    // 混合检索：真实向量召回真同义
    const hybrid = await searchPrivateMemory({ ownerId: "member:alice", query: "car servicing", limit: 5 });
    expect(hybrid.length).toBeGreaterThan(0);
    expect(hybrid[0].sourceId).toBe("ev-car");
    expect(hybrid[0].matchedVia).toBe("semantic");
  });

  it("recalls a true Chinese synonym with no token or character overlap (车辆保养 → 汽车维护)", async () => {
    setSemanticEmbedderForTests(createSemanticEmbedder({ useOllama: true, fetchImpl: mockOllamaFetch() }));
    await addMemorySnippet({
      ownerId: "member:alice", sessionId: "s1", sourceId: "ev-cn", kind: "note",
      text: "汽车维护",
    });

    const lexical = await searchPrivateMemory({ ownerId: "member:alice", query: "车辆保养", limit: 5, mode: "lexical-only" });
    expect(lexical).toHaveLength(0);

    const hybrid = await searchPrivateMemory({ ownerId: "member:alice", query: "车辆保养", limit: 5 });
    expect(hybrid.length).toBeGreaterThan(0);
    expect(hybrid[0].sourceId).toBe("ev-cn");
  });
});

describe("explicit degradation when the embedding model is unavailable", () => {
  it("falls back to char n-gram and reports degraded=true, without faking semantics", async () => {
    setSemanticEmbedderForTests(createSemanticEmbedder({ useOllama: true, fetchImpl: mockOllamaDownFetch() }));
    await addMemorySnippet({
      ownerId: "member:alice", sessionId: "s1", sourceId: "ev-car", kind: "note",
      text: "automobile maintenance",
    });

    expect(getSemanticEmbedderStatus()).toMatchObject({ degraded: true });

    // 降级后字符 n-gram 召不回「car↔automobile」这种零字符重叠的真同义（诚实降级）
    const hits = await searchPrivateMemory({ ownerId: "member:alice", query: "car servicing", limit: 5 });
    expect(hits).toHaveLength(0);

    // 但词面命中的检索仍可用
    const lexicalHits = await searchPrivateMemory({ ownerId: "member:alice", query: "automobile maintenance", limit: 5 });
    expect(lexicalHits.length).toBeGreaterThan(0);
  });
});
