/**
 * 联邦编排器（v3.2 package 02 / M5）
 *
 * 并行扇出 OpenAlex / Open Library / seed 三源 → 去重合并 → FederationResult。
 * 设计原则：
 *  - 全值传递：federateSearch 永不抛异常，失败走 failures 数组
 *  - 不撒谎：每个源的成功/失败/空结果都如实上报，绝不互相顶替
 *  - seed 是显式联邦源（带 kind:"seed" 标识），不是"网络失败的伪装品"
 */

import type { ResourceCard } from "@/lib/types";
import { dedupeCandidates, type DedupeCandidate } from "./dedupe";
import { searchOpenAlexFederated, type OpenAlexFederatedOptions } from "./openAlexFederated";
import { searchOpenLibrary, type OpenLibraryAdapterOptions } from "./openLibraryAdapter";
import type { FederationFailure, FederationResult, SourceOutcome } from "./types";

/** seed 检索函数签名（默认接 seedCatalogAdapter，测试可注入） */
export type SeedSearch = (query: {
  topic: string;
  limit: number;
}) => Promise<ResourceCard[]>;

export interface FederateQuery {
  topic: string;
  limit?: number;
}

export interface FederateOptions {
  /** 是否纳入 OpenAlex 源（默认 true；OPENALEX_DISABLED=1 时由上层置 false） */
  includeOpenAlex?: boolean;
  /** 是否纳入 Open Library 源（默认 true；OPENLIBRARY_DISABLED=1 时由上层置 false） */
  includeOpenLibrary?: boolean;
  /** 是否纳入 seed 源（默认 true：seed 是显式兜底源，不是伪装） */
  includeSeed?: boolean;
  /** seed 检索（默认用 seedCatalogAdapter，离线可用） */
  seedSearch?: SeedSearch;
  openAlex?: OpenAlexFederatedOptions;
  openLibrary?: OpenLibraryAdapterOptions;
  /** 测试时钟 */
  now?: () => number;
}

/** ResourceCard（seed）→ DedupeCandidate：seed 无 DOI/ISBN，走标题层去重 */
function seedCardToCandidate(card: ResourceCard, retrievedAt: number): DedupeCandidate {
  return {
    title: card.title,
    authors: [...card.authors],
    year: card.year ?? null,
    source: {
      kind: "seed",
      label: "本地种子",
      sourceId: card.id,
      retrievedAt,
    },
  };
}

async function defaultSeedSearch(query: {
  topic: string;
  limit: number;
}): Promise<ResourceCard[]> {
  const { seedCatalogAdapter } = await import("@/lib/catalog/seedCatalogAdapter");
  return seedCatalogAdapter.searchCatalog({
    query: query.topic,
    limit: query.limit,
  });
}

/**
 * 联邦主题检索：三源并行扇出 → M2 去重 → 值传递结果。
 *
 * degraded 判定：一个可用条目都没有（items 空）且存在失败/空结果——
 * 这是"真没结果"与"降级到啥都没有"的分界线，前端据此提示。
 */
export async function federateSearch(
  query: FederateQuery,
  options: FederateOptions = {},
): Promise<FederationResult> {
  const {
    includeOpenAlex = true,
    includeOpenLibrary = true,
    includeSeed = true,
    seedSearch = defaultSeedSearch,
    openAlex = {},
    openLibrary = {},
    now = () => Date.now(),
  } = options;

  const limit = query.limit ?? 12;
  const retrievedAt = now();

  // 逐源结局矩阵：disabled 先记（未启用的源），成功/空/失败在各自 fan-out 里补。
  const outcomes: SourceOutcome[] = [];
  if (!includeOpenAlex) outcomes.push({ kind: "openalex", status: "disabled" });
  if (!includeOpenLibrary) outcomes.push({ kind: "openlibrary", status: "disabled" });
  if (!includeSeed) outcomes.push({ kind: "seed", status: "disabled" });

  const tasks: Array<Promise<{ candidates: DedupeCandidate[]; failure?: FederationFailure }>> = [];
  if (includeOpenAlex) {
    // OpenAlex：主源（国内直连）
    tasks.push(
      searchOpenAlexFederated({ topic: query.topic, limit }, { ...openAlex, now }).then((res) => {
        if (res.ok) {
          outcomes.push({ kind: "openalex", status: res.candidates.length > 0 ? "success" : "empty" });
          return { candidates: [...res.candidates] };
        }
        outcomes.push({ kind: "openalex", status: "failed" });
        return { candidates: [], failure: res.failure };
      }),
    );
  }
  if (includeOpenLibrary) {
    // Open Library：被墙，失败常见——失败如实上报
    tasks.push(
      searchOpenLibrary({ topic: query.topic, limit }, { ...openLibrary, now }).then((res) => {
        if (res.ok) {
          outcomes.push({ kind: "openlibrary", status: res.candidates.length > 0 ? "success" : "empty" });
          return { candidates: [...res.candidates] };
        }
        outcomes.push({ kind: "openlibrary", status: "failed" });
        return { candidates: [], failure: res.failure };
      }),
    );
  }
  if (includeSeed) {
    tasks.push(
      seedSearch({ topic: query.topic, limit })
        .then((cards) => {
          outcomes.push({ kind: "seed", status: cards.length > 0 ? "success" : "empty" });
          return { candidates: cards.map((c) => seedCardToCandidate(c, retrievedAt)) };
        })
        .catch((error: unknown) => {
          outcomes.push({ kind: "seed", status: "failed" });
          // seed 失败极罕见（纯本地），但也不撒谎
          return {
            candidates: [] as DedupeCandidate[],
            failure: {
              kind: "unreachable" as const,
              source: "seed" as const,
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }),
    );
  }

  const settled = await Promise.all(tasks);
  const candidates = settled.flatMap((s) => s.candidates);
  const failures = settled
    .map((s) => s.failure)
    .filter((f): f is FederationFailure => f !== undefined);

  const { items } = dedupeCandidates(candidates);

  return {
    items,
    failures,
    degraded: items.length === 0 && failures.length > 0,
    sourceOutcomes: outcomes,
  };
}
