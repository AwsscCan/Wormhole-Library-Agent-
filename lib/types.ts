/**
 * =============================================================
 *  FROZEN INTERFACE CONTRACT — v1.0 (2026-08-20)
 * =============================================================
 *  Owner: 队友01 (integration).
 *  队友02 (catalog / living library) 和 队友03 (wormhole / memory)
 *  的模块必须 import 并满足这里的类型。
 *
 *  修改规则：
 *  - 只能「加可选字段」，不能改名 / 删字段 / 改必填字段类型。
 *  - 任何 breaking change 必须先在群里同步并升版本号。
 * =============================================================
 */

/* ---------------------------------------------------------- */
/* Shared enums                                                */
/* ---------------------------------------------------------- */

export type ResourceType = "book" | "paper" | "course" | "thesis";
export type Availability = "available" | "checked_out" | "online" | "unknown";
export type Difficulty = "intro" | "undergrad" | "graduate" | "research";
export type Language = "zh" | "en";
export type LanguagePref = "zh" | "en" | "any";
export type TaskType = "course" | "project" | "research" | "exam" | "curiosity";
export type Level = "beginner" | "undergraduate" | "graduate" | "research";

export type FeedbackTargetType = "resource" | "wormhole" | "person_match";
export type FeedbackRating =
  | "too_close"
  | "just_right"
  | "too_far"
  | "too_hard"
  | "not_relevant"
  | "useful";

export type DisplayMode = "anonymous" | "named";
export type ContactState = "request_required" | "requested" | "accepted" | "declined";
export type WillingType = "async_answer" | "coffee_chat" | "project_review" | "reading_guide";
export type MatchMode = "collision" | "mentor" | "similar";

/* ---------------------------------------------------------- */
/* Concept                                                     */
/* ---------------------------------------------------------- */

export interface ConceptRef {
  id: string;
  name: string;
  domain?: string;
}

/** Full concept shape used by seed data + graph (队友03 owns semantics). */
export interface ConceptSeed {
  id: string;
  name: string;
  aliases: string[];
  domain: string;
  description: string;
  /** deterministic pseudo-embedding; precomputed or hash-derived */
  embedding?: number[];
  popularity?: number;
}

export interface ConceptEdgeSeed {
  fromConceptId: string;
  toConceptId: string;
  relation: string;
  weight: number; // 0..1
  explanation: string;
}

/* ---------------------------------------------------------- */
/* Card contracts (UI 渲染以此为准)                              */
/* ---------------------------------------------------------- */

/** 馆藏资源卡（队友02产出 → UI 直接渲染） */
export interface ResourceCard {
  id: string;
  type: ResourceType;
  title: string;
  authors: string[];
  year?: number;
  language: Language;
  /** why this resource — 一句人话解释 */
  why: string;
  location?: string;
  callNumber?: string;
  availability: Availability;
  difficulty: Difficulty;
  concepts: ConceptRef[];
  qualityScore: number; // 0..1
  sourceUrl?: string;
}

export interface WormholeScores {
  novelty: number;      // 0..1
  noveltyFit: number;   // 0..1
  bridge: number;       // 0..1
  quality: number;      // 0..1
  diversity: number;    // 0..1
  final: number;        // 0..1
}

/** 知识虫洞卡（队友03产出 → UI 直接渲染） */
export interface WormholeCard {
  id: string;
  /** concept names, start → ... → destination（含首尾） */
  path: string[];
  /** 与 path 一一对应的 concept ids */
  pathConceptIds: string[];
  destination: string;
  destinationConceptId: string;
  /** why this jump works — 平实语言 */
  explanation: string;
  scores: WormholeScores;
  /** 落点资源，必须至少 resources 或 livingBooks 其一非空 */
  resources: ResourceCard[];
  livingBooks: LivingBookCard[];
}

/** Living Library 人物卡（队友02产出；consent-safe：匿名模式绝不带真名） */
export interface LivingBookCard {
  id: string;
  displayMode: DisplayMode;
  /** 仅 displayMode === "named" 时存在 */
  displayName?: string;
  headline: string;
  expertiseConcepts: ConceptRef[];
  willingTypes: WillingType[];
  expertiseLevel: "peer" | "senior" | "mentor";
  availabilityNote?: string;
  contactState: ContactState;
}

/** 人物碰撞匹配卡（匿名优先，不暴露身份） */
export interface PersonMatchCard {
  id: string;
  displayMode: DisplayMode;
  headline: string;
  /** bridge concept names，解释为什么匹配 */
  bridge: string[];
  collisionReason: string;
  score: number; // 0..1
  contactState: ContactState;
}

/* ---------------------------------------------------------- */
/* Memory contracts (队友03 Memory Compiler 输入/输出)           */
/* ---------------------------------------------------------- */

export interface MemoryPatch {
  /** e.g. "difficulty.mathTolerance" | "serendipity.likedDomains" */
  key: string;
  operation?: "set" | "increment" | "decrement" | "add_or_increment" | "remove";
  value: unknown;
  confidenceDelta: number;
  reason: string;
}

export interface MemorySummary {
  reading: {
    language: "zh_first" | "en_first" | "any";
    resourceTypeOrder: ResourceType[] | string[];
    summaryFirst: boolean;
    maxResults: number;
    /** 责任包03 扩展：偏好实证/理论（可选，向后兼容） */
    prefEmpirical?: boolean;
    prefTheoretical?: boolean;
  };
  difficulty: {
    preferredLevel: Difficulty;
    mathTolerance: number; // 0..1
    paperDensity: number;  // 0..1
    /** 责任包03 扩展：理论容忍度（可选，向后兼容） */
    theoryTolerance?: number; // 0..1
  };
  serendipity: {
    defaultSlider: number; // 0..100
    noveltyMean: number;
    noveltyStd: number;
    likedDomains: string[];
    dislikedDomains: string[];
  };
  social: {
    matchingMode: "ask_first" | "auto" | "off";
    anonymousFirst: boolean;
    livingBookOptIn: boolean;
  };
  /** 责任包03 扩展：默认引用格式（可选，向后兼容） */
  citation?: {
    defaultStyle?: "apa" | "mla" | "gbt7714" | "chicago";
  };
}

export interface MemoryUpdateEvent {
  at: string; // ISO timestamp
  patches: MemoryPatch[];
  sourceFeedbackId?: string;
}

/* ---------------------------------------------------------- */
/* API contracts — 路由与结构冻结                                */
/* ---------------------------------------------------------- */
/*
  POST /api/search             SearchRequest        -> SearchResponse
  GET  /api/search?interactionId=  (integration ext) -> SearchResponse
  POST /api/wormholes          WormholesRequest     -> WormholesResponse
  POST /api/feedback           FeedbackRequest      -> FeedbackResponse
  GET  /api/memory?userId=     -                    -> MemoryResponse
  DELETE /api/memory?userId=   (demo reset ext)     -> MemoryResponse
  POST /api/matches            MatchesRequest       -> MatchesResponse
  POST /api/contact-requests   ContactRequestCreate -> ContactRequestResponse
  POST /api/review             ReviewRequest        -> ReviewResponse
*/

export interface SearchRequest {
  userId: string;
  query: string;
  taskType?: TaskType;
  level?: Level;
  sliderValue?: number; // 0..100
}

export interface SearchResponse {
  interactionId: string;
  query: string;
  concepts: ConceptRef[];
  resources: ResourceCard[];
  /** concept names 组成的推荐阅读路径 */
  readingPath: string[];
  /** 本次用到了哪些记忆（人话短句） */
  memoryUsed: string[];
  /** demo 模式标注（降级不撒谎） */
  demoCatalog?: boolean;
}

export interface WormholesRequest {
  userId: string;
  interactionId: string;
  startConceptIds: string[];
  sliderValue: number; // 0..100
  maxPaths?: number;   // default 3
}

export interface WormholesResponse {
  wormholes: WormholeCard[];
  /** unknown-unknown 提示卡（可选能力） */
  unknownUnknowns?: Array<{
    concept: ConceptRef;
    whyItMatters: string;
  }>;
}

export interface FeedbackRequest {
  userId: string;
  interactionId: string;
  targetType: FeedbackTargetType;
  targetId: string;
  rating: FeedbackRating;
  freeText?: string;
}

export interface FeedbackResponse {
  feedbackId: string;
  memoryPatches: MemoryPatch[];
  memorySummary: MemorySummary;
}

export interface MemoryResponse {
  userId: string;
  memory: MemorySummary;
  recentUpdates: MemoryUpdateEvent[];
}

export interface MatchesRequest {
  userId: string;
  conceptIds: string[];
  mode?: MatchMode; // default "collision"
}

export interface MatchesResponse {
  matches: PersonMatchCard[];
}

export interface ContactRequestCreate {
  userId: string;
  personMatchId: string;
  message: string;
}

export interface ContactRequestResponse {
  requestId: string;
  status: "pending" | "accepted" | "declined";
}

/** 文献综述是扩展接口；不改变既有冻结 API 的请求/响应结构。 */
export type ReviewFocus = "methods" | "findings" | "timeline";

export interface ReviewRequest {
  userId: string;
  /** Demo catalog resource IDs; production may map these to OpenAlex paper IDs. */
  paperIds: string[];
  focus?: ReviewFocus;
}

export interface ReviewResponse {
  reviewText: string;
  papersUsed: string[];
  /** `concat` 表示没有可用 LLM，内容来自标明的馆藏摘要拼接。 */
  source: "ollama" | "concat";
}

/* ---------------------------------------------------------- */
/* API error format（统一错误结构）                              */
/* ---------------------------------------------------------- */

export interface ApiError {
  error: {
    code:
      | "BAD_REQUEST"
      | "NOT_FOUND"
      | "CONSENT_REQUIRED"
      | "INTERNAL_ERROR";
    message: string;
  };
}

/* ---------------------------------------------------------- */
/* Module boundaries（队友模块必须实现的函数签名）                  */
/* ---------------------------------------------------------- */

/** 队友02：馆藏适配器接口（lib/catalog/adapter.ts 实现） */
export interface CatalogAdapter {
  searchCatalog(input: {
    query: string;
    conceptIds?: string[];
    resourceTypes?: ResourceType[];
    language?: LanguagePref;
    limit?: number;
    /** 可选：任务类型，供排序层使用（队友02 §10 权重体系） */
    taskType?: TaskType;
    /** 可选：用户水平，供排序层使用 */
    level?: Level;
    /** 可选：用户记忆摘要，供排序层 memory bonus 使用 */
    memory?: MemorySummary;
  }): Promise<ResourceCard[]>;
  getResourceDetails(resourceId: string): Promise<ResourceCard | null>;
  findResourcesByConcept(conceptId: string, limit?: number): Promise<ResourceCard[]>;
}

/** 队友02：Living Library 检索接口 */
export interface LivingLibraryService {
  searchLivingBooks(input: {
    conceptIds: string[];
    limit?: number;
  }): Promise<LivingBookCard[]>;
  findLivingBooksByConcept(conceptId: string, limit?: number): Promise<LivingBookCard[]>;
}

/** 队友03：虫洞生成接口（lib/wormhole/generate.ts 实现） */
export interface WormholeEngine {
  generateWormholes(input: {
    userId: string;
    startConceptIds: string[];
    sliderValue: number;
    maxPaths: number;
    memory: MemorySummary;
  }): Promise<WormholeCard[]>;
}

/** 队友03：概念抽取接口（lib/concepts/conceptExtraction.ts 实现） */
export interface ConceptExtractor {
  extractConcepts(query: string): Promise<{
    concepts: ConceptRef[];
    taskType?: TaskType;
    level?: Level;
  }>;
}

/** 队友03：Memory Compiler 接口（lib/memory/compileFeedback.ts 实现） */
export interface MemoryCompiler {
  compileFeedback(input: FeedbackRequest, current: MemorySummary): Promise<MemoryPatch[]>;
}

/* ---------------------------------------------------------- */
/* 论文级（PaperWorm）类型 — 责任包03 引擎内部使用                  */
/* 与上方概念级契约并存；与冻结契约同名的接口以 Paper* 前缀区分      */
/* ---------------------------------------------------------- */

export type PaperId = string;
export type UserId = string;
export type InteractionId = string;

/** 论文概念标签（OpenAlex concepts 映射） */
export type ConceptTag = {
  id: string;
  name: string;
  score: number;   // 0-1 relevance
  level: number;   // 0=broad, 4=narrow
};

export type Author = {
  name: string;
  orcid: string | null;
  institution: string | null;
};

export type Paper = {
  id: PaperId;
  doi: string | null;
  title: string;
  authors: Author[];
  year: number;
  venue: string | null;
  citedByCount: number;
  abstract: string | null;
  concepts: ConceptTag[];
  openAccess: boolean;
  openAccessPdf: string | null;
  referencedWorks: PaperId[]; // papers this work cites
};

/** 轻量论文卡（列表与虫洞落点用） */
export type PaperCard = {
  id: PaperId;
  title: string;
  doi: string | null;
  year: number;
  authors: string[];
  citedByCount: number;
  abstract: string | null;
  concepts: ConceptTag[];
  openAccess: boolean;
  openAccessPdf: string | null; // OA 全文直链
  _rankScore?: number;
};

export type CitationMetadata = {
  doi: string;
  title: string;
  authors: { family: string; given: string }[];
  year: number;
  containerTitle: string;
  volume: string | null;
  issue: string | null;
  page: string | null;
  publisher: string | null;
  type: string;
};

export type CitationResult = {
  doi: string;
  style: "apa" | "mla" | "gbt7714" | "chicago";
  text: string;
  metadata: CitationMetadata;
  source: "crossref" | "manual";
};

/** 论文级反馈（与 API 层 FeedbackRequest 不同物） */
export type Feedback = {
  targetType: "paper" | "wormhole" | "citation";
  targetId: string;
  rating: "too_theoretical" | "too_empirical" | "too_hard" | "just_right" | "interesting";
  freeText: string | null;
};

export type MemoryCategory = "reading" | "difficulty" | "citation" | "serendipity" | "task";

export type UserMemory = {
  userId: string;
  category: MemoryCategory;
  key: string;
  value: unknown;
  confidence: number;
  source: "explicit_feedback" | "implicit_click" | "system_inferred";
  useCount: number;
  updatedAt: string;
};

/** 论文级记忆快照（与 API 层 MemorySummary 字段相近，独立演进） */
export type MemorySnapshot = {
  reading: {
    languagePref?: "zh_first" | "en_first" | "no_pref";
    summaryFirst?: boolean;
    resultCount?: number;
    prefEmpirical?: boolean;
    prefTheoretical?: boolean;
  };
  difficulty: {
    preferredLevel?: "beginner" | "undergrad" | "graduate" | "research";
    mathTolerance?: number;
    theoryTolerance?: number;
  };
  citation: {
    defaultStyle?: "apa" | "mla" | "gbt7714" | "chicago";
  };
  serendipity: {
    defaultSlider?: number;
    likedDomains: string[];
    dislikedDomains: string[];
  };
};

export type MemoryHistoryEntry = {
  timestamp: string;
  action: string;
  detail: string;
  patches: MemoryPatch[];
};

/** 论文级虫洞卡（引擎原始输出；UI 渲染用上方概念级 WormholeCard） */
export type PaperWormholeCard = {
  id: string;
  path: PaperId[];
  startConcepts: ConceptTag[];
  targetConcepts: ConceptTag[];
  targetPaper: PaperCard;
  explanation: string;
  scores: {
    novelty: number;
    bridge: number;
    quality: number;
    final: number;
  };
};

export type ConceptNode = {
  id: string;
  name: string;
  aliases: string[];
  domain: string;
  level: number;
  score: number;
};

export type ConceptEdge = {
  source: string;   // concept node id
  target: string;   // concept node id
  weight: number;   // 0-1
  type: "subclass_of" | "related_to" | "applied_in" | "studies" | "uses";
};

/** 概念图运行时接口（lib/concepts/graph.ts 实现） */
export interface ConceptGraph {
  nodes: Map<string, ConceptNode>;
  edges: ConceptEdge[];
  /** Find a path between two concepts through the graph. */
  findPath(fromId: string, toId: string): ConceptEdge[];
  /** Get neighbors of a concept. */
  getNeighbors(nodeId: string): { node: ConceptNode; edge: ConceptEdge }[];
  /** Compute concept overlap (Jaccard) between two concept sets. */
  overlap(a: ConceptTag[], b: ConceptTag[]): number;
}

/** 论文级虫洞引擎接口（lib/wormhole/generate.ts 实现） */
export interface PaperWormholeEngine {
  /** Generate wormhole paths from a start paper, modulated by the serendipity slider. */
  generate(params: {
    startPaperId: PaperId;
    sliderValue: number;
    maxPaths?: number;
    papers: Map<PaperId, PaperCard>;
    references: Map<PaperId, PaperId[]>;
    concepts: Map<PaperId, ConceptTag[]>;
    memory?: MemorySnapshot;
    conceptGraph?: ConceptGraph;
  }): PaperWormholeCard[];
}

/** 论文级概念抽取接口（lib/concepts/conceptExtraction.ts 实现） */
export interface PaperConceptExtractor {
  /** Extract concepts from a paper's concept tags (filter by level/score). */
  extract(paper: PaperCard): ConceptTag[];
  /** Extract concepts from raw text using the concept graph + keyword matching. */
  extractFromText(text: string, graph?: ConceptGraph): ConceptTag[];
}

/** 论文级 Memory Compiler 接口（lib/memory/index.ts 实现） */
export interface PaperMemoryCompiler {
  /** Compile user feedback into structured memory patches. */
  compile(feedback: Feedback, paper?: PaperCard): MemoryPatch[];
  /** Apply patches to a memory snapshot, returning the updated snapshot. */
  apply(memory: MemorySnapshot, patches: MemoryPatch[]): { memory: MemorySnapshot; history: MemoryHistoryEntry };
  /** Re-rank search results based on user memory. */
  rank(papers: PaperCard[], memory: MemorySnapshot): PaperCard[];
  /** Render a human-readable context string for LLM injection. */
  getContext(memory: MemorySnapshot, query: string): string;
}
