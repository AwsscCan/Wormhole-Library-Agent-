/**
 * 责任包03 补交回归测试
 * 对应验收文档（docs/RESPONSIBILITY-PACKAGE-03-ACCEPTANCE.md）：
 *  - 03-01 冻结契约适配器（ConceptExtractor / WormholeEngine / MemoryCompiler）
 *  - 03-02 六种 rating 全量走正式编译器，不再回退 fallback
 *  - 03-03 正式 getMemory / applyPatch 接管编排层记忆读写
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  LibraryAgentOrchestrator,
  getFormalMemoryStore,
} from "@/lib/agent/orchestrator";
import { resetMemory, defaultMemory } from "@/lib/mock/store";
import { ConceptExtractorContract, extractConcepts } from "@/lib/concepts";
import { WormholeEngineContract, generateWormholes } from "@/lib/wormhole";
import { MemoryCompilerContract } from "@/lib/memory";
import { toPaperFeedback } from "@/lib/wormhole/adapter";
import { getMemory as getFormalMemory } from "@/lib/memory/getMemory";
import type {
  ConceptExtractor,
  WormholeEngine,
  MemoryCompiler,
} from "@/lib/types";

const USER = "it_frozen_contract";
const USER_FORMAL = "it_formal_memory";

describe("03-01 冻结契约：三个接口均有适配器实现并从模块入口导出", () => {
  it("ConceptExtractorContract 实现 extractConcepts(query)", async () => {
    const extractor: ConceptExtractor = new ConceptExtractorContract();
    const { concepts } = await extractor.extractConcepts(
      "I want to learn AI Agent"
    );
    expect(concepts.length).toBeGreaterThan(0);
    expect(concepts.map((c) => c.id)).toContain("c_ai_agent");

    // 函数形式导出同样可用
    const viaFn = await extractConcepts("transformer attention mechanism");
    expect(viaFn.concepts.length).toBeGreaterThan(0);
  });

  it("WormholeEngineContract 实现 generateWormholes(input)", async () => {
    const engine: WormholeEngine = new WormholeEngineContract();
    const cards = await engine.generateWormholes({
      userId: USER,
      startConceptIds: ["c_ai_agent"],
      sliderValue: 70,
      maxPaths: 3,
      memory: defaultMemory(),
    });
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.path.length).toBeGreaterThanOrEqual(2);
      expect(c.resources.length + c.livingBooks.length).toBeGreaterThan(0);
    }

    // 论文库中无匹配起点 → 空数组（是否 fallback 由调用方决定）
    const none = await generateWormholes({
      userId: USER,
      startConceptIds: ["c_nonexistent_concept"],
      sliderValue: 50,
      maxPaths: 3,
      memory: defaultMemory(),
    });
    expect(none).toEqual([]);
  });

  it("MemoryCompilerContract 实现 compileFeedback(input, current)", async () => {
    const compiler: MemoryCompiler = new MemoryCompilerContract();
    const patches = await compiler.compileFeedback(
      {
        userId: USER,
        interactionId: "int_x",
        targetType: "wormhole",
        targetId: "any",
        rating: "too_hard",
      },
      defaultMemory()
    );
    expect(patches.length).toBeGreaterThan(0);
    expect(patches.some((p) => p.key === "difficulty.mathTolerance")).toBe(true);
  });
});

describe("03-02 六种 rating 全量走正式 Memory Compiler（不再回退）", () => {
  let orchestrator: LibraryAgentOrchestrator;
  let interactionId: string;
  let targetId: string;

  beforeEach(async () => {
    orchestrator = new LibraryAgentOrchestrator();
    resetMemory(USER);
    await orchestrator.resetMemory(USER);
    const search = await orchestrator.search({ userId: USER, query: "AI Agent" });
    const wh = await orchestrator.wormholes({
      userId: USER,
      interactionId: search.interactionId,
      startConceptIds: ["c_ai_agent"],
      sliderValue: 60,
    });
    expect(wh.wormholes.length).toBeGreaterThan(0);
    interactionId = search.interactionId;
    targetId = wh.wormholes[0].id;
  });

  it("toPaperFeedback 对六种 API rating 全部返回正式 Feedback（无 null 路径）", () => {
    const ratings = [
      "too_close",
      "just_right",
      "too_far",
      "too_hard",
      "not_relevant",
      "useful",
    ] as const;
    const DISTANCE = ["too_close", "too_far", "not_relevant"] as const;
    for (const rating of ratings) {
      const fb = toPaperFeedback({
        userId: USER,
        interactionId,
        targetType: "wormhole",
        targetId,
        rating,
      });
      expect(fb.rating).toBeTruthy();
      if ((DISTANCE as readonly string[]).includes(rating)) {
        // 冻结契约合规：距离类 rating 走可选字段 distanceRating，
        // rating 联合保持原 5 值（交接规则只允许加可选字段）。
        expect(fb.distanceRating).toBe(rating);
      } else {
        expect(fb.distanceRating).toBeUndefined();
      }
    }
  });

  it("六种 rating 经 orchestrator.feedback 均产出正式 patch（逐项断言不回退）", async () => {
    const ratings = [
      "too_close",
      "just_right",
      "too_far",
      "too_hard",
      "not_relevant",
      "useful",
    ] as const;
    for (const rating of ratings) {
      const res = await orchestrator.feedback({
        userId: USER,
        interactionId,
        targetType: "wormhole",
        targetId,
        rating,
        freeText: "machine learning 方向不太相关",
      });
      // 若该 rating 回退 fallback 且无 domain 上下文，patches 可能为空；
      // 正式编译器对六种 rating 都保证产出 patch。
      expect(res.memoryPatches.length, `rating=${rating}`).toBeGreaterThan(0);
      for (const p of res.memoryPatches) {
        expect(p.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("too_close / too_far 具备滑杆语义：抬升 / 降低默认意外度", async () => {
    const base = (await orchestrator.memory(USER)).memory.serendipity
      .defaultSlider;
    await orchestrator.feedback({
      userId: USER,
      interactionId,
      targetType: "wormhole",
      targetId,
      rating: "too_close",
    });
    const raised = (await orchestrator.memory(USER)).memory.serendipity
      .defaultSlider;
    expect(raised).toBeGreaterThan(base);

    await orchestrator.feedback({
      userId: USER,
      interactionId,
      targetType: "wormhole",
      targetId,
      rating: "too_far",
    });
    const lowered = (await orchestrator.memory(USER)).memory.serendipity
      .defaultSlider;
    expect(lowered).toBeLessThan(raised);
  });
});

describe("03-03 正式 getMemory / applyPatch 接管编排层记忆", () => {
  it("反馈经正式 applyPatch 持久化到 MemoryStore，跨实例可见", async () => {
    const orchestrator = new LibraryAgentOrchestrator();
    await orchestrator.resetMemory(USER_FORMAL);
    const search = await orchestrator.search({
      userId: USER_FORMAL,
      query: "AI Agent",
    });

    const before = (await orchestrator.memory(USER_FORMAL)).memory.difficulty
      .mathTolerance;
    await orchestrator.feedback({
      userId: USER_FORMAL,
      interactionId: search.interactionId,
      targetType: "wormhole",
      targetId: "any",
      rating: "too_hard",
    });
    const after = (await orchestrator.memory(USER_FORMAL)).memory.difficulty
      .mathTolerance;
    expect(after).toBeLessThan(before);

    // 正式存储层持有记忆条目（source=db），而非仅 mock map
    const { memory, source } = await getFormalMemory(
      USER_FORMAL,
      getFormalMemoryStore()
    );
    expect(source).toBe("db");
    expect(memory.difficulty.mathTolerance ?? 0.5).toBeLessThan(0.5);

    // 新编排层实例读取同一正式存储（状态不依赖实例）
    const fresh = new LibraryAgentOrchestrator();
    expect(
      (await fresh.memory(USER_FORMAL)).memory.difficulty.mathTolerance
    ).toBeLessThan(0.5);
  });
});

describe("03-04 责任书 11 个公开入口全部从模块导出并可用", () => {
  it("concepts：extractConcepts / findConceptPaths / cosine / buildUserVector", async () => {
    const { findConceptPaths, cosine, buildUserVector } = await import(
      "@/lib/concepts"
    );

    // findConceptPaths：AI Agent → Mechanism Design 概念链可达
    const paths = findConceptPaths(["c_ai_agent", "c_nonexistent"], "c_mechanism_design");
    const viaAgent = paths.find((p) => p.startId === "c_ai_agent");
    expect(viaAgent).toBeDefined();
    expect(viaAgent!.pathLength).toBeGreaterThanOrEqual(2);
    expect(viaAgent!.edges.length).toBe(viaAgent!.pathLength);
    // 不存在的起点概念被跳过；不存在的终点返回空数组
    expect(paths.find((p) => p.startId === "c_nonexistent")).toBeUndefined();
    expect(findConceptPaths(["c_ai_agent"], "c_nonexistent")).toEqual([]);

    // cosine：同向量相似度 1，无关向量 0
    const va = new Map([["c_ai_agent", 1], ["c_game_theory", 1]]);
    expect(cosine(va, new Map(va))).toBeCloseTo(1);
    expect(cosine(va, new Map([["c_forgetting_curve", 1]]))).toBe(0);

    // buildUserVector：词表长度 = 概念图节点数，起点概念位置为 1
    const { loadConceptGraph } = await import("@/lib/concepts");
    const graph = loadConceptGraph();
    const vec = buildUserVector(USER, ["c_ai_agent", "c_game_theory"]);
    expect(vec.length).toBe(graph.nodes.size);
    expect(vec.filter((v) => v === 1).length).toBe(2);
    expect(vec.every((v) => v === 0 || v === 1)).toBe(true);
  });

  it("wormhole：generateWormholes / rankWormholes / findUnknownUnknowns", async () => {
    const {
      getDefaultWormholeEngine,
      rankWormholes,
      findUnknownUnknowns,
    } = await import("@/lib/wormhole");
    const { loadPaperLibrary, pickStartPaperId } = await import(
      "@/lib/paperLibrary"
    );

    // 引擎直出论文级虫洞卡（rankWormholes / findUnknownUnknowns 的输入）
    const paperLib = loadPaperLibrary();
    const startPaperId = pickStartPaperId(["c_ai_agent"]);
    expect(startPaperId).toBeTruthy();
    const cards = getDefaultWormholeEngine().generate({
      startPaperId: startPaperId!,
      sliderValue: 70,
      maxPaths: 3,
      papers: paperLib.papers,
      references: paperLib.references,
      concepts: paperLib.concepts,
    });
    expect(cards.length).toBeGreaterThan(0);

    // rankWormholes：记忆修正参与排序（排序不抛错、候选集合不变）
    const memory = {
      reading: {},
      difficulty: {},
      citation: {},
      serendipity: { defaultSlider: 50, likedDomains: [], dislikedDomains: [] },
    } satisfies Parameters<typeof rankWormholes>[1] extends { memory?: infer M } | undefined ? M : never;
    const ranked = rankWormholes(cards, { sliderValue: 70, memory });
    expect(ranked).toHaveLength(cards.length);
    expect(new Set(ranked.map((c) => c.id))).toEqual(new Set(cards.map((c) => c.id)));

    // findUnknownUnknowns：从虫洞终点提取用户没见过的概念
    const uu = await findUnknownUnknowns({
      wormholes: cards,
      startConceptIds: ["c_ai_agent"],
    });
    expect(uu.length).toBeGreaterThan(0);
    expect(uu.length).toBeLessThanOrEqual(2);
    for (const card of uu) {
      expect(card.conceptId).not.toBe("c_ai_agent");
      expect(card.whyItMatters.length).toBeGreaterThan(0);
    }
  });

  it("memory：getUserMemory / compileFeedbackMemory / applyMemoryPatch / applyMemoryToRanking", async () => {
    const {
      getUserMemory,
      compileFeedbackMemory,
      applyMemoryPatch,
      applyMemoryToRanking,
      InMemoryStore,
    } = await import("@/lib/memory");
    const { toPaperFeedback } = await import("@/lib/wormhole/adapter");

    const store = new InMemoryStore();
    const userId = "it_pkg03_entries";

    // getUserMemory：空存储返回默认快照
    const initial = await getUserMemory(userId, store);
    expect(initial.serendipity).toBeDefined();

    // compileFeedbackMemory：距离类反馈走 distanceRating 可选字段
    const patches = compileFeedbackMemory(
      toPaperFeedback({
        userId,
        interactionId: "int_x",
        targetType: "wormhole",
        targetId: "any",
        rating: "too_close",
      })
    );
    expect(patches.some((p) => p.key === "serendipity.defaultSlider")).toBe(true);

    // applyMemoryPatch：应用补丁并持久化，跨 store 读取可见
    const updated = await applyMemoryPatch(userId, patches, store);
    expect(updated.serendipity.defaultSlider!).toBeGreaterThan(
      initial.serendipity.defaultSlider ?? 50
    );
    const reread = await getUserMemory(userId, store);
    expect(reread.serendipity.defaultSlider).toBe(
      updated.serendipity.defaultSlider
    );

    // applyMemoryToRanking：likedDomains 命中加 0.05，dislikedDomains 命中减 0.08
    // （修正规则按概念名 level <= 1 匹配 domain）
    const paper = {
      id: "p1",
      title: "Test",
      abstract: "",
      citedByCount: 10,
      openAccess: false,
      year: 2024,
      authors: [],
      concepts: [{ id: "c_game_theory", name: "Game Theory", level: 1, score: 0.9, domain: "Economics" }],
    } as unknown as Parameters<typeof applyMemoryToRanking>[1];
    const mem = {
      reading: {},
      difficulty: {},
      citation: {},
      serendipity: { defaultSlider: 50, likedDomains: ["Game Theory"], dislikedDomains: [] },
    } as NonNullable<Parameters<typeof applyMemoryToRanking>[2]>;
    expect(applyMemoryToRanking(0.5, paper, mem)).toBeCloseTo(0.55);
    mem.serendipity = { defaultSlider: 50, likedDomains: [], dislikedDomains: ["Game Theory"] };
    expect(applyMemoryToRanking(0.5, paper, mem)).toBeCloseTo(0.42);
  });
});
