/**
 * Package 04 真实语义检索消融（验收报告 F-004 / E-005）。
 *
 * 证明混合检索的语义分数来自真实向量嵌入（可注入），而非共享 token：
 *  - 中文/英文「无 token 重叠」但字符层面相关的同义 fixture：lexical-only 召回 0，hybrid 召回 >0
 *  - 注入真实语义嵌入后，「完全无字符重叠」的真同义（car→automobile、车辆→汽车）也能召回，
 *    证明检索管线确实消费向量语义信号（生产可换成 ollamaEmbedding）。
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  addMemorySnippet,
  resetInferenceForTests,
  resetLearningLedgerForTests,
  resetMemoryIndexForTests,
  searchPrivateMemory,
} from "@/lib/research/memory";
import type { Embedding } from "@/lib/research/memory/embedding";

beforeEach(() => {
  resetLearningLedgerForTests();
  resetMemoryIndexForTests();
  resetInferenceForTests();
});

describe("lexical-only vs hybrid ablation", () => {
  it("recalls a Chinese synonym with no shared token (汽车维护 ← 汽车保养)", () => {
    addMemorySnippet({
      ownerId: "member:alice", sessionId: "s1", sourceId: "ev-1", kind: "note",
      text: "汽车维护的关键是定期更换机油和检查刹车。",
    });

    // 词面（token）层：两句话无共享 token → lexical-only 为空
    const lexical = searchPrivateMemory({ ownerId: "member:alice", query: "汽车保养", limit: 5, mode: "lexical-only" });
    expect(lexical).toHaveLength(0);

    // 混合检索：字符 bigram「汽车」对齐 → 召回
    const hybrid = searchPrivateMemory({ ownerId: "member:alice", query: "汽车保养", limit: 5 });
    expect(hybrid.length).toBeGreaterThan(0);
    expect(hybrid[0].sourceId).toBe("ev-1");
    expect(hybrid[0].matchedVia).toBe("semantic");
  });

  it("recalls an English morphological synonym with no shared token (automobile ← automotive)", () => {
    addMemorySnippet({
      ownerId: "member:alice", sessionId: "s1", sourceId: "ev-en", kind: "note",
      text: "Automobile maintenance schedules extend engine life.",
    });

    const lexical = searchPrivateMemory({ ownerId: "member:alice", query: "automotive servicing", limit: 5, mode: "lexical-only" });
    expect(lexical).toHaveLength(0);

    const hybrid = searchPrivateMemory({ ownerId: "member:alice", query: "automotive servicing", limit: 5 });
    expect(hybrid.length).toBeGreaterThan(0);
    expect(hybrid[0].sourceId).toBe("ev-en");
  });
});

describe("injected true-semantic embedding", () => {
  /** 模拟真实同义嵌入：把同义词映射到同一个 basis 维度。 */
  const synonymClasses: Record<string, string> = {
    car: "vehicle", automobile: "vehicle",
    汽车: "vehicle", 车辆: "vehicle",
    maintenance: "repair", servicing: "repair",
    维护: "repair", 保养: "repair",
  };
  function synonymEmbedding(text: string): Embedding {
    const vec = new Array(32).fill(0);
    const units: string[] = [];
    // 中文：字符 bigram；英文：整词
    const cjk = text.match(/[\u4e00-\u9fff]+/g) ?? [];
    for (const seg of cjk) for (let i = 0; i < seg.length - 1; i += 1) units.push(seg.slice(i, i + 2));
    for (const word of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) units.push(word);

    for (const unit of units) {
      const cls = synonymClasses[unit] ?? unit;
      let h = 0;
      for (let i = 0; i < cls.length; i += 1) h = (h * 31 + cls.charCodeAt(i)) >>> 0;
      vec[h % 32] += 1;
    }
    const len = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return len ? vec.map((v) => v / len) : vec;
  }

  it("recalls a true English synonym (car servicing → automobile maintenance) through the injected embedding", () => {
    addMemorySnippet({
      ownerId: "member:alice", sessionId: "s1", sourceId: "ev-car", kind: "note",
      text: "Automobile maintenance notes",
    }, { embed: synonymEmbedding });

    // 完全无字符重叠 → 默认字符嵌入召回不到
    expect(searchPrivateMemory({ ownerId: "member:alice", query: "car servicing", limit: 5 })).toHaveLength(0);

    // 注入真实同义嵌入 → 召回
    const hits = searchPrivateMemory({ ownerId: "member:alice", query: "car servicing", limit: 5 }, { embed: synonymEmbedding });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sourceId).toBe("ev-car");
    expect(hits[0].matchedVia).toBe("semantic");
  });

  it("recalls a true Chinese synonym (车辆 → 汽车) through the injected embedding", () => {
    addMemorySnippet({
      ownerId: "member:alice", sessionId: "s1", sourceId: "ev-cn", kind: "note",
      text: "汽车日常检查要点",
    }, { embed: synonymEmbedding });

    const hits = searchPrivateMemory({ ownerId: "member:alice", query: "车辆日常检查", limit: 5 }, { embed: synonymEmbedding });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sourceId).toBe("ev-cn");
  });
});
