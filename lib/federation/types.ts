/**
 * Source Federation types (v3.2 package 02)
 *
 * 不动 lib/types.ts 的冻结契约。本文件定义联邦层独有类型：
 *  - SourceKind：来源类型联合
 *  - FederationFailure：判别联合（含来源 + 元信息）
 *  - EvidenceItem / SourceRef：写入通路用的稳定条目
 *  - FederationResult：查询结果外形（让上层不抛异常，纯值传递）
 */

/** 来源类型（不受 string 字面量到上层，保持品牌一致性） */
export type SourceKind =
  | "openalex"      // OpenAlex 真实命中
  | "openlibrary"   // Open Library 真实命中（演示侧需开 VPN；CI 用 fixture）
  | "seed"          // 本地 seed 兜底（须明确标识，绝不冒充真实）
  | "user";         // 用户自有笔记/收藏（v3.3+ 接入，本期只用其类型）

/**
 * 联邦层失败类型 ——「不撒谎降级」承诺的根。
 *
 * 设计目的：让上层（API / orchestrator / UI）能精确定位"哪个源"出了什么错，
 * 而不是被一个通用 Error 把来源信息吞掉。
 */
export type FederationFailure =
  | { kind: "unreachable"; source: SourceKind; message: string }
  | { kind: "rate_limited"; source: SourceKind; retryAfterMs?: number }
  | { kind: "parse_error"; source: SourceKind; body: string }
  | { kind: "empty"; source: SourceKind; query: string }
  | { kind: "circuit_open"; source: SourceKind; cooldownUntil: number };

/**
 * 单个来源的引用 —— 一条 EvidenceItem 可能来自多个来源，sources 数组列出全部。
 * 这是"诚实多源"的最小表达：绝不合并成单一"网络"标签。
 */
export interface SourceRef {
  kind: SourceKind;
  /** 人类友好标签（e.g. "OpenAlex"、"Open Library"、"本地种子"） */
  label: string;
  /** 该来源特定 ID（如 OpenAlex 的 W2741809807、Open Library 的 OL45804W） */
  sourceId: string;
  /** 检索时间戳（epoch ms）；用于审计和"上次检索于 N 小时前"提示 */
  retrievedAt: number;
}

/**
 * 稳定证据条目 —— 给 03 写作用的形状，跨会话、跨 API、跨源抖动都保持稳定。
 * 稳定 ID 由 doi/isbn + 标题 hash 派生（详见 federation.ts 的 createStableId 实现）。
 */
export interface EvidenceItem {
  id: string;
  title: string;
  authors: readonly string[];
  /** 部分来源库不返回年份 */
  year: number | null;
  excerpt?: string;
  sources: readonly SourceRef[];
  retrievedAt: number;
  doi?: string;
  isbn?: string;
  /** 原始 URL（任一来源的展示用） */
  url?: string;
}

/**
 * 单个源在本轮扇出中的结局 —— 来源透明度状态矩阵的原料。
 *  - success：该源返回了 ≥1 条候选
 *  - empty：该源成功响应但 0 条候选（合法的"无结果"，不是失败）
 *  - failed：该源 unreachable / rate_limited / parse_error
 *  - disabled：该源本轮未启用（环境开关 / options 关闭）
 */
export type SourceOutcome = {
  kind: SourceKind;
  status: "success" | "empty" | "failed" | "disabled";
};

/**
 * 联邦查询结果 —— 全值传递，调用方自行决定怎么处理 failures。
 * 这是 orchestrator 与 federation 之间的契约：federation 永不抛异常。
 */
export interface FederationResult {
  items: readonly EvidenceItem[];
  failures: readonly FederationFailure[];
  /** 全失败判定：failures.length 等于本轮扇出的源数，且 items 为空 */
  degraded: boolean;
  /** 逐源结局矩阵（package 02 → package 05 的来源透明度契约） */
  sourceOutcomes?: readonly SourceOutcome[];
}

/** 联邦层的源描述（编排器扇出时使用，未来可能按健康度过滤） */
export interface FederatedSource {
  kind: SourceKind;
  label: string;
  /** 上次成功响应时间（用于冷启动判断） */
  lastSuccessAt?: number;
}

/**
 * 单个源适配器的统一响应：成功带候选，失败带分类后的 FederationFailure。
 * ok:false 时绝不返回部分结果——「不撒谎降级」：失败就是失败，不伪装成空结果。
 */
export type AdapterResponse =
  | { ok: true; candidates: readonly import("./dedupe").DedupeCandidate[] }
  | { ok: false; failure: FederationFailure };
