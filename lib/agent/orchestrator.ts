/**
 * LibraryAgentOrchestrator（队友01 — 集成核心）
 *
 * 所有 API route 只调这个文件，不直接碰 mock 或队友模块。
 *
 * 责任包03 补交（2026-08-23，对应验收文档 4 项未达标）：
 *  - 03-01 三个接线点改为依赖冻结契约实现（ConceptExtractor /
 *    WormholeEngine / MemoryCompiler 的 Contract 适配器，见各模块
 *    index.ts），不再直接依赖论文级内部类。
 *  - 03-02 六种 rating 全量走正式 Memory Compiler，无 fallback 回退。
 *  - 03-03 正式 getMemory / applyPatch / saveSnapshot 接管编排层记忆
 *    读写（MemoryStore 为单一事实源）；MemorySummary 仅作 UI 视图，
 *    由 toMemorySummary() 从快照单一转换而来，反馈后直接影响下一次
 *    search / wormholes 的排序输入。
 */
import {
  buildReadingPathFallback,
  extractConceptsFallback,
  findLivingBooksByConceptFallback,
  generateWormholesFallback,
} from "@/lib/mock/fallbackEngine";
import { catalogAdapter } from "@/lib/catalog/adapter";
import {
  getMemory as getMockMemory,
  getMemoryEvents,
  getStore,
  nextId,
  pushMemoryEvent,
  resetMemory as resetMockMemory,
} from "@/lib/mock/store";
import { ConceptExtractorContract } from "@/lib/concepts";
import { WormholeEngineContract } from "@/lib/wormhole";
import { MemoryCompilerContract } from "@/lib/memory";
import {
  getMemory as getFormalMemory,
  resetMemory as resetFormalMemory,
  saveSnapshot,
  InMemoryStore,
  type MemoryStore,
} from "@/lib/memory/getMemory";
import { applyPatch } from "@/lib/memory/applyPatch";
import { sharedStore } from "@/lib/memory/fileStore";
import { toMemorySnapshot, toMemorySummary } from "@/lib/wormhole/adapter";
import { generateLiteratureReview } from "@/lib/review";
import type {
  FeedbackRequest,
  FeedbackResponse,
  MatchesRequest,
  MatchesResponse,
  MemoryResponse,
  MemorySnapshot,
  MemorySummary,
  PersonMatchCard,
  SearchRequest,
  SearchResponse,
  WormholeCard,
  WormholesRequest,
  WormholesResponse,
  ContactRequestCreate,
  ContactRequestResponse,
  ReviewRequest,
  ReviewResponse,
} from "@/lib/types";

/* ------------ 冻结契约实现单例（03-01 补交） ------------ */

/** 正式概念抽取（冻结契约 ConceptExtractor 适配器）单例 */
let _conceptExtractor: ConceptExtractorContract | null = null;
function getConceptExtractor(): ConceptExtractorContract {
  if (!_conceptExtractor) _conceptExtractor = new ConceptExtractorContract();
  return _conceptExtractor;
}

/** 正式虫洞引擎（冻结契约 WormholeEngine 适配器）单例 */
let _wormholeEngine: WormholeEngineContract | null = null;
function getWormholeEngine(): WormholeEngineContract {
  if (!_wormholeEngine) _wormholeEngine = new WormholeEngineContract();
  return _wormholeEngine;
}

/** 正式记忆编译器（冻结契约 MemoryCompiler 适配器）单例 */
let _memoryCompiler: MemoryCompilerContract | null = null;
function getMemoryCompiler(): MemoryCompilerContract {
  if (!_memoryCompiler) _memoryCompiler = new MemoryCompilerContract();
  return _memoryCompiler;
}

/* ------------ 正式记忆存储（03-03 补交） ------------ */

const gMem = globalThis as unknown as {
  __pkg03MemoryStore?: MemoryStore;
  __pkg03Snapshots?: Map<string, MemorySnapshot>;
};

/**
 * 正式 MemoryStore 单例。
 * - 运行时：FileStore（lib/memory/fileStore.ts）——JSON 落盘、重启不丢、
 *   跨 API route 共享同一实例。
 * - 测试环境（VITEST / NODE_ENV=test）：保持 InMemoryStore，用例隔离
 *   且不会把 <cwd>/.data 写脏。
 * - 接 Prisma 时仅需在此替换为 Prisma 实现（接口见 MemoryStore）。
 */
export function getFormalMemoryStore(): MemoryStore {
  const isTest =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  if (!isTest) return sharedStore;
  if (!gMem.__pkg03MemoryStore) gMem.__pkg03MemoryStore = new InMemoryStore();
  return gMem.__pkg03MemoryStore;
}

/** 进程内快照缓存（避免每次请求异步重建，写路径同步更新） */
function snapshotCache(): Map<string, MemorySnapshot> {
  if (!gMem.__pkg03Snapshots) gMem.__pkg03Snapshots = new Map();
  return gMem.__pkg03Snapshots;
}

export class LibraryAgentOrchestrator {
  /* ------------ 正式记忆链路读写（03-03 补交） ------------ */

  /**
   * 读取（并缓存）用户正式 MemorySnapshot。
   * 正式存储为空时，以 demo 基线 MemorySummary 为种子，保证与既有行为一致。
   */
  private async snapshot(userId: string): Promise<MemorySnapshot> {
    const cache = snapshotCache();
    const cached = cache.get(userId);
    if (cached) return cached;

    const { memory, source } = await getFormalMemory(userId, getFormalMemoryStore());
    const snap = source === "db" ? memory : toMemorySnapshot(getMockMemory(userId));
    cache.set(userId, snap);
    return snap;
  }

  /**
   * MemorySummary 仅是 UI 视图：由正式快照 + demo 基线
   * （social / resourceTypeOrder 等快照不跟踪的字段）合成。
   */
  private async summary(userId: string): Promise<MemorySummary> {
    const snap = await this.snapshot(userId);
    return toMemorySummary(snap, getMockMemory(userId));
  }

  /* ------------------------- search ------------------------- */
  async search(req: SearchRequest): Promise<SearchResponse> {
    const memory = await this.summary(req.userId);

    // INTEGRATION POINT [队友03] → 冻结契约 ConceptExtractor（概念图关键词匹配，level/score 过滤）
    const { concepts } = await getConceptExtractor().extractConcepts(req.query);
    if (concepts.length === 0) {
      // 回退：keyword fallback（自带 AI Agent 兜底，保证 demo 不空屏）
      concepts.push(...extractConceptsFallback(req.query));
    }
    const conceptIds = concepts.map((c) => c.id);

    const language = req.language ?? (memory.reading.language === "zh_first"
        ? "zh"
        : memory.reading.language === "en_first"
          ? "en"
          : "any");
    const resources = await catalogAdapter.searchCatalog({
      query: req.query,
      conceptIds,
      language,
      limit: memory.reading.maxResults,
      taskType: req.taskType,
      level: req.level,
      memory,
    });

    const readingPath = buildReadingPathFallback(conceptIds);

    const memoryUsed: string[] = [];
    if (memory.reading.language === "zh_first") memoryUsed.push("中文/概览优先");
    if (memory.serendipity.likedDomains.length > 0)
      memoryUsed.push(`偏好领域：${memory.serendipity.likedDomains.join("、")}`);
    if (memory.difficulty.mathTolerance < 0.4) memoryUsed.push("降低数学密度");

    const interactionId = nextId("int");
    const response: SearchResponse = {
      interactionId,
      query: req.query,
      concepts,
      resources,
      readingPath,
      memoryUsed,
      // Only label a result as demo data when every returned item is local
      // seed data. External records preserve sourceUrl through the adapter.
      demoCatalog: resources.length > 0 && resources.every((resource) => !resource.sourceUrl),
    };

    getStore().interactions.set(interactionId, {
      id: interactionId,
      userId: req.userId,
      query: req.query,
      sliderValue: req.sliderValue ?? memory.serendipity.defaultSlider,
      conceptIds,
      searchResponse: response,
      createdAt: new Date().toISOString(),
    });

    return response;
  }

  getInteraction(interactionId: string) {
    return getStore().interactions.get(interactionId) ?? null;
  }

  /* ------------------------ wormholes ----------------------- */
  async wormholes(req: WormholesRequest): Promise<WormholesResponse> {
    const memory = await this.summary(req.userId);

    // INTEGRATION POINT [队友03] → 冻结契约 WormholeEngine（论文级引用图 + 概念差异度打分）。
    // 起点概念在论文库中无匹配论文、或引擎无有效路径时，回退概念级 fallback 保证 demo 不空屏。
    let wormholes: WormholeCard[] = await getWormholeEngine().generateWormholes({
      userId: req.userId,
      startConceptIds: req.startConceptIds,
      sliderValue: req.sliderValue,
      maxPaths: req.maxPaths ?? 3,
      memory,
    });
    if (wormholes.length === 0) {
      wormholes = generateWormholesFallback({
        startConceptIds: req.startConceptIds,
        sliderValue: req.sliderValue,
        maxPaths: req.maxPaths ?? 3,
        memory,
      });
    }

    const interaction = getStore().interactions.get(req.interactionId);
    if (interaction) {
      interaction.wormholes = wormholes;
      interaction.sliderValue = req.sliderValue;
    }

    // Unknown Unknowns：取虫洞终点里 novelty 中高、且用户查询里没出现过的概念
    const unknownUnknowns = wormholes
      .filter((w) => w.scores.novelty >= 0.4)
      .slice(0, 2)
      .map((w) => ({
        concept: {
          id: w.destinationConceptId,
          name: w.destination,
        },
        whyItMatters: w.explanation,
      }));

    return { wormholes, unknownUnknowns };
  }

  /* ------------------------- feedback ----------------------- */
  async feedback(req: FeedbackRequest): Promise<FeedbackResponse> {
    const snapshot = await this.snapshot(req.userId);
    const baseSummary = getMockMemory(req.userId);

    // INTEGRATION POINT [队友03] → 冻结契约 MemoryCompiler。
    // 六种 rating 全量映射（含 too_close / too_far / not_relevant），
    // 不再回退 compileFeedbackFallback。
    const patches = await getMemoryCompiler().compileFeedback(
      req,
      toMemorySummary(snapshot, baseSummary),
    );

    // 正式 applyPatch：不可变更新 + 历史条目，随后持久化到 MemoryStore（03-03）
    const { memory: next, history } = applyPatch(snapshot, patches);
    snapshotCache().set(req.userId, next);
    await saveSnapshot(getFormalMemoryStore(), req.userId, next);
    await getFormalMemoryStore().saveHistory(req.userId, history);

    const feedbackId = nextId("fb");
    pushMemoryEvent(req.userId, {
      at: new Date().toISOString(),
      patches,
      sourceFeedbackId: feedbackId,
    });

    return {
      feedbackId,
      memoryPatches: patches,
      memorySummary: toMemorySummary(next, baseSummary),
    };
  }

  /* -------------------------- memory ------------------------ */
  async memory(userId: string): Promise<MemoryResponse> {
    return {
      userId,
      memory: await this.summary(userId),
      recentUpdates: getMemoryEvents(userId),
    };
  }

  async resetMemory(userId: string): Promise<MemoryResponse> {
    // 正式链路重置：清空 MemoryStore 与快照缓存，demo 基线回默认
    await resetFormalMemory(userId, getFormalMemoryStore());
    snapshotCache().delete(userId);
    resetMockMemory(userId);
    return {
      userId,
      memory: await this.summary(userId),
      recentUpdates: [],
    };
  }

  /* -------------------------- review ------------------------ */
  async review(req: ReviewRequest): Promise<ReviewResponse> {
    return generateLiteratureReview(req);
  }

  /* -------------------------- matches ----------------------- */
  async matches(req: MatchesRequest): Promise<MatchesResponse> {
    const memory = await this.summary(req.userId);
    if (memory.social.matchingMode === "off") {
      return { matches: [] };
    }

    // INTEGRATION POINT [队友02+03]: collision matching service
    // fallback：用 Living Library 数据合成 consent-safe 匿名匹配卡
    const matches: PersonMatchCard[] = [];
    const seen = new Set<string>();
    for (const conceptId of req.conceptIds) {
      for (const lb of findLivingBooksByConceptFallback(conceptId)) {
        if (seen.has(lb.id)) continue;
        seen.add(lb.id);
        matches.push({
          id: `pm_${lb.id}`,
          displayMode: "anonymous", // 推荐卡永远匿名，命名只在对方接受后
          headline: lb.headline,
          bridge: lb.expertiseConcepts.map((c) => c.name),
          collisionReason: "你们的研究主题不同，但共享同一条概念桥，互补性强。",
          score: 0.7,
          contactState: "request_required",
        });
      }
    }
    return { matches: matches.slice(0, 3) };
  }

  /* ---------------------- contact request ------------------- */
  async createContactRequest(req: ContactRequestCreate): Promise<ContactRequestResponse> {
    // mock：只存 pending，不发送任何真实消息
    void req;
    return { requestId: nextId("cr"), status: "pending" };
  }
}

// 单例（Next.js route handler 之间共享）
const g = globalThis as unknown as { __orchestrator?: LibraryAgentOrchestrator };
export function getOrchestrator(): LibraryAgentOrchestrator {
  if (!g.__orchestrator) g.__orchestrator = new LibraryAgentOrchestrator();
  return g.__orchestrator;
}
