/**
 * OpenAlex 联邦适配器（v3.2 package 02 / M4）
 *
 * 与 lib/catalog/openAlexAdapter.ts 的分工：
 *  - 那边是 CatalogAdapter（给 orchestrator/搜索页用，失败回退 seed 是它自己的契约）
 *  - 这边是联邦层诚实版：失败绝不静默、绝不回退，直接上报 FederationFailure
 *    （包 02 红线："网络失败不得伪装为无结果"）
 *
 * OpenAlex 国内可直连、免费、无 Key，是联邦层的主源。
 */

import type { DedupeCandidate } from "./dedupe";
import { classifyError, classifyHttpFailure } from "./failures";
import type { AdapterResponse } from "./types";

/** OpenAlex works 返回结构（只声明联邦层消费的字段） */
interface OpenAlexWork {
  id: string;
  doi?: string | null;
  display_name: string;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string } }[];
}

interface OpenAlexWorksResponse {
  results?: OpenAlexWork[];
}

export type Transport = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>;

const defaultTransport: Transport = (url, init) => fetch(url, init);

const OPENALEX_BASE = "https://api.openalex.org/works";
const POLITE_MAILTO = "wormhole-library-agent@example.com"; // OpenAlex polite pool

export interface OpenAlexQuery {
  topic: string;
  limit?: number;
}

export interface OpenAlexFederatedOptions {
  baseUrl?: string;
  timeoutMs?: number;
  transport?: Transport;
  now?: () => number;
}

function toCandidate(
  work: OpenAlexWork,
  retrievedAt: number,
): DedupeCandidate | null {
  const title = work.display_name?.trim();
  if (!title || !work.id) return null; // 脏数据丢弃，不编造条目
  const authors = (work.authorships ?? [])
    .map((a) => a.author?.display_name ?? "")
    .filter(Boolean);
  const doi = work.doi?.replace(/^https?:\/\/doi\.org\//, "");
  return {
    title,
    authors,
    year: work.publication_year ?? null,
    doi,
    source: {
      kind: "openalex",
      label: "OpenAlex",
      sourceId: work.id.replace("https://openalex.org/", ""),
      retrievedAt,
    },
  };
}

/**
 * 按主题查询 OpenAlex（联邦层诚实版）。
 * 空查询 → ok:true 空结果（调用方问题不是网络失败，不上报假 failure）。
 * 网络/HTTP/解析失败 → ok:false + FederationFailure，绝不静默回退。
 */
export async function searchOpenAlexFederated(
  query: OpenAlexQuery,
  options: OpenAlexFederatedOptions = {},
): Promise<AdapterResponse> {
  const {
    baseUrl = OPENALEX_BASE,
    timeoutMs = 6000,
    transport = defaultTransport,
    now = () => Date.now(),
  } = options;

  if (!query.topic.trim()) {
    return { ok: true, candidates: [] };
  }

  const limit = Math.min(Math.max(query.limit ?? 12, 1), 100);
  const url =
    `${baseUrl}?search=${encodeURIComponent(query.topic)}` +
    `&per-page=${limit}&mailto=${encodeURIComponent(POLITE_MAILTO)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        failure: classifyHttpFailure(
          "openalex",
          response.status,
          body,
          response.headers.get("retry-after") ?? undefined,
        ),
      };
    }
    const json = (await response.json()) as OpenAlexWorksResponse;
    const retrievedAt = now();
    const candidates = (json.results ?? [])
      .map((work) => toCandidate(work, retrievedAt))
      .filter((c): c is DedupeCandidate => c !== null);
    return { ok: true, candidates };
  } catch (error) {
    return {
      ok: false,
      failure: classifyError("openalex", error, { query: query.topic }),
    };
  } finally {
    clearTimeout(timer);
  }
}
