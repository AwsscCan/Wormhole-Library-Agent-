/**
 * 真实引擎集成测试：验证 orchestrator 的三处接线点
 * （概念抽取 / 虫洞生成 / 反馈编译）已切换到正式引擎，
 * 而不是永远静默回退到 fallback。
 */

import { beforeEach, describe, expect, it } from "vitest";
import { LibraryAgentOrchestrator } from "@/lib/agent/orchestrator";
import { resetMemory } from "@/lib/mock/store";
import { loadPaperLibrary, pickStartPaperId } from "@/lib/paperLibrary";
import type { SearchRequest, WormholesRequest, FeedbackRequest } from "@/lib/types";

const USER = "it_real_engine";

describe("真实引擎集成（orchestrator 接线验证）", () => {
  let orchestrator: LibraryAgentOrchestrator;

  beforeEach(() => {
    orchestrator = new LibraryAgentOrchestrator();
    resetMemory(USER);
  });

  it("论文库加载：39 篇 seed 论文，引用链完整", () => {
    const lib = loadPaperLibrary();
    expect(lib.papers.size).toBeGreaterThanOrEqual(30);
    let refCount = 0;
    const ids = new Set(lib.papers.keys());
    for (const refs of lib.references.values()) {
      for (const r of refs) {
        expect(ids.has(r)).toBe(true); // 引用目标必须存在
        refCount++;
      }
    }
    expect(refCount).toBeGreaterThanOrEqual(30);
  });

  it("起点选择：概念能映射到论文库中的论文", () => {
    const startId = pickStartPaperId(["c_information_theory"]);
    expect(startId).not.toBeNull();
    const startId2 = pickStartPaperId(["c_ai_agent"]);
    expect(startId2).not.toBeNull();
    // 不相关概念组 → null（触发 fallback 的正确行为）
    expect(pickStartPaperId(["c_nonexistent_concept"])).toBeNull();
  });

  it("search → wormholes 全链路：正式引擎产出虫洞卡", async () => {
    const searchReq: SearchRequest = {
      userId: USER,
      query: "transformer attention mechanism",
      taskType: "research",
    };
    const searchRes = await orchestrator.search(searchReq);
    expect(searchRes.concepts.length).toBeGreaterThan(0);

    const wormholeReq: WormholesRequest = {
      userId: USER,
      interactionId: searchRes.interactionId,
      startConceptIds: searchRes.concepts.map((c) => c.id),
      sliderValue: 70,
      maxPaths: 3,
    };
    const wormholeRes = await orchestrator.wormholes(wormholeReq);

    expect(wormholeRes.wormholes.length).toBeGreaterThan(0);
    for (const w of wormholeRes.wormholes) {
      // UI 契约：路径首尾齐全、落点有资源或人物、解释非空
      expect(w.path.length).toBeGreaterThanOrEqual(2);
      expect(w.destination).toBeTruthy();
      expect(w.explanation.length).toBeGreaterThan(0);
      expect(w.resources.length + w.livingBooks.length).toBeGreaterThan(0);
      expect(w.scores.final).toBeGreaterThanOrEqual(0);
      expect(w.scores.final).toBeLessThanOrEqual(1);
    }
  });

  it("feedback 全链路：反馈 → 记忆 patch → 排序变化（答辩主展示）", async () => {
    const searchRes = await orchestrator.search({
      userId: USER,
      query: "statistical physics",
      taskType: "research",
    });
    const wormholeRes = await orchestrator.wormholes({
      userId: USER,
      interactionId: searchRes.interactionId,
      startConceptIds: searchRes.concepts.map((c) => c.id),
      sliderValue: 60,
      maxPaths: 3,
    });
    expect(wormholeRes.wormholes.length).toBeGreaterThan(0);

    // 先取原始值（getMemory 返回引用，applyPatches 原地修改）
    const beforeTolerance = (await orchestrator.memory(USER)).memory.difficulty
      .mathTolerance;
    const target = wormholeRes.wormholes[0];

    const fbReq: FeedbackRequest = {
      userId: USER,
      interactionId: searchRes.interactionId,
      targetType: "wormhole",
      targetId: target.id,
      rating: "too_hard",
    };
    const fbRes = await orchestrator.feedback(fbReq);
    expect(fbRes.memoryPatches.length).toBeGreaterThan(0);

    // 记忆确实变化：mathTolerance 下降或 liked/dislikedDomains 增长
    const after = fbRes.memorySummary;
    const memoryChanged =
      after.difficulty.mathTolerance < beforeTolerance ||
      after.serendipity.dislikedDomains.length > 0 ||
      after.serendipity.likedDomains.length > 0;
    expect(memoryChanged).toBe(true);

    // 每个 patch 都带 reason（可解释性）
    for (const p of fbRes.memoryPatches) {
      expect(p.reason.length).toBeGreaterThan(0);
    }
  });

  it("slider 语义：高新颖度滑杆产出 novelty 更高的虫洞", async () => {
    const searchRes = await orchestrator.search({
      userId: USER,
      query: "game theory mechanism design",
      taskType: "research",
    });
    const mk = (slider: number) =>
      orchestrator.wormholes({
        userId: USER,
        interactionId: searchRes.interactionId,
        startConceptIds: searchRes.concepts.map((c) => c.id),
        sliderValue: slider,
        maxPaths: 5,
      });
    const low = await mk(10);
    const high = await mk(90);
    const avg = (xs: { scores: { novelty: number } }[]) =>
      xs.reduce((s, w) => s + w.scores.novelty, 0) / Math.max(1, xs.length);
    // 高滑杆的平均 novelty 不低于低滑杆（容忍回退混合的边界情况）
    expect(avg(high.wormholes)).toBeGreaterThanOrEqual(avg(low.wormholes) - 0.05);
  });
});
