/**
 * LibraryAgentOrchestrator（队友01 — 集成核心）
 *
 * 所有 API route 只调这个文件，不直接碰 mock 或队友模块。
 * 队友模块接入方式：把下面 INTEGRATION POINT 处的 fallback 调用
 * 替换为真实模块（签名见 lib/types.ts 的 CatalogAdapter /
 * WormholeEngine / ConceptExtractor / MemoryCompiler）。
 */
import {
  buildReadingPathFallback,
  extractConceptsFallback,
  findLivingBooksByConceptFallback,
  generateWormholesFallback,
} from "@/lib/mock/fallbackEngine";
import { catalogAdapter } from "@/lib/catalog/adapter";
import {
  getMemory,
  getMemoryEvents,
  getStore,
  nextId,
  pushMemoryEvent,
  resetMemory,
} from "@/lib/mock/store";
import { compileFeedbackFallback, applyPatches, compileFeedback } from "@/lib/memory/compileFeedback";
import { ConceptExtractorImpl } from "@/lib/concepts/conceptExtraction";
import { loadConceptGraph } from "@/lib/concepts/graph";
import { WormholeEngineImpl } from "@/lib/wormhole/generate";
import { loadPaperLibrary, pickStartPaperId } from "@/lib/paperLibrary";
import {
  lookupPaperByTargetId,
  toMemorySnapshot,
  toPaperFeedback,
  toUiWormholeCards,
} from "@/lib/wormhole/adapter";
import { generateLiteratureReview } from "@/lib/review";
import type {
  ConceptRef,
  FeedbackRequest,
  FeedbackResponse,
  MatchesRequest,
  MatchesResponse,
  MemoryPatch,
  MemoryResponse,
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

/** 正式虫洞引擎单例（构造时加载概念图，进程内复用） */
let _wormholeEngine: WormholeEngineImpl | null = null;
function getWormholeEngine(): WormholeEngineImpl {
  if (!_wormholeEngine) _wormholeEngine = new WormholeEngineImpl();
  return _wormholeEngine;
}

/** 正式概念抽取器单例 */
let _conceptExtractor: ConceptExtractorImpl | null = null;
function getConceptExtractor(): ConceptExtractorImpl {
  if (!_conceptExtractor) _conceptExtractor = new ConceptExtractorImpl();
  return _conceptExtractor;
}

export class LibraryAgentOrchestrator {
  /* ------------------------- search ------------------------- */
  async search(req: SearchRequest): Promise<SearchResponse> {
    const memory = getMemory(req.userId);

    // INTEGRATION POINT [队友03] → 正式概念抽取（概念图关键词匹配，level/score 过滤）
    const tagHits = getConceptExtractor().extractFromText(req.query).slice(0, 8);
    const graph = loadConceptGraph();
    const concepts: ConceptRef[] = tagHits.map((t) => ({
      id: t.id,
      name: t.name,
      domain: graph.nodes.get(t.id)?.domain,
    }));
    if (concepts.length === 0) {
      // 回退：keyword fallback（自带 AI Agent 兜底，保证 demo 不空屏）
      concepts.push(...extractConceptsFallback(req.query));
    }
    const conceptIds = concepts.map((c) => c.id);

    const language =
      memory.reading.language === "zh_first"
        ? "zh"
        : memory.reading.language === "en_first"
          ? "en"
          : "any";
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
      demoCatalog: true, // 降级不撒谎：目前是 seed catalog
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
    const memory = getMemory(req.userId);

    // INTEGRATION POINT [队友03] → 正式虫洞引擎（论文级引用图 + 概念差异度打分）。
    // 起点概念在论文库中无匹配论文、或引擎无有效路径时，回退概念级 fallback 保证 demo 不空屏。
    const paperLib = loadPaperLibrary();
    const startPaperId = pickStartPaperId(req.startConceptIds);
    let wormholes: WormholeCard[] = [];
    if (startPaperId) {
      const engineCards = getWormholeEngine().generate({
        startPaperId,
        sliderValue: req.sliderValue,
        maxPaths: req.maxPaths ?? 3,
        papers: paperLib.papers,
        references: paperLib.references,
        concepts: paperLib.concepts,
        memory: toMemorySnapshot(memory),
      });
      wormholes = toUiWormholeCards(engineCards);
    }
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
    const memory = getMemory(req.userId);
    const interaction = getStore().interactions.get(req.interactionId);

    // INTEGRATION POINT [队友03] → 正式 Memory Compiler（论文级，带目标论文上下文）。
    // 论文级编译器不覆盖的 rating（too_close / too_far / not_relevant）
    // 回退概念级编译器，其本身即按这些语义设计。
    const targetWormhole = interaction?.wormholes?.find((w) => w.id === req.targetId);
    const paperFeedback = toPaperFeedback(req);
    const paper = lookupPaperByTargetId(req.targetId);
    const patches: MemoryPatch[] = paperFeedback
      ? compileFeedback(paperFeedback, paper)
      : compileFeedbackFallback(req, memory, targetWormhole);

    applyPatches(memory, patches);

    const feedbackId = nextId("fb");
    pushMemoryEvent(req.userId, {
      at: new Date().toISOString(),
      patches,
      sourceFeedbackId: feedbackId,
    });

    return { feedbackId, memoryPatches: patches, memorySummary: memory };
  }

  /* -------------------------- memory ------------------------ */
  async memory(userId: string): Promise<MemoryResponse> {
    return {
      userId,
      memory: getMemory(userId),
      recentUpdates: getMemoryEvents(userId),
    };
  }

  async resetMemory(userId: string): Promise<MemoryResponse> {
    return {
      userId,
      memory: resetMemory(userId),
      recentUpdates: [],
    };
  }

  /* -------------------------- review ------------------------ */
  async review(req: ReviewRequest): Promise<ReviewResponse> {
    return generateLiteratureReview(req);
  }

  /* -------------------------- matches ----------------------- */
  async matches(req: MatchesRequest): Promise<MatchesResponse> {
    const memory = getMemory(req.userId);
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
