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
  };
  difficulty: {
    preferredLevel: Difficulty;
    mathTolerance: number; // 0..1
    paperDensity: number;  // 0..1
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
