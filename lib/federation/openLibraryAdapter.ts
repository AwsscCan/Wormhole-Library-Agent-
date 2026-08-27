/**
 * Open Library 适配器（v3.2 package 02 / M3）
 *
 * 现实约束：openlibrary.org 国内直连被墙。因此：
 *  - transport 可注入：测试与 fixture 实验走 stub，不打真实网络
 *  - 真实调用仅在开 VPN 时进行（scripts/record-openlibrary-fixtures.ts 录制）
 *  - 任何失败都经 failures.ts 分类为 FederationFailure，绝不静默吞掉
 */

import type { DedupeCandidate } from "./dedupe";
import { classifyError, classifyHttpFailure } from "./failures";
import type { AdapterResponse } from "./types";

/** Open Library search.json 返回的单条 doc（只声明我们消费的字段） */
interface OpenLibraryDoc {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  doi?: string[]; // 少数 works 有 DOI，字段名可能为 doi 数组
  cover_i?: number;
  subject?: string[];
}

interface OpenLibrarySearchResponse {
  numFound?: number;
  start?: number;
  docs?: OpenLibraryDoc[];
}

/** 默认 transport：真实 fetch + 超时中断 */
export type Transport = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>;

const defaultTransport: Transport = (url, init) => fetch(url, init);

export interface OpenLibraryQuery {
  /** 主题/关键词（自由文本，映射到 search.json 的 q） */
  topic: string;
  /** 每源上限（默认 12，避免一次拉太多被限流） */
  limit?: number;
}

export interface OpenLibraryAdapterOptions {
  /** 基地址（测试/录制回放时可替换） */
  baseUrl?: string;
  /** 请求超时毫秒数（默认 8000） */
  timeoutMs?: number;
  /** 注入的 transport（默认全局 fetch） */
  transport?: Transport;
  /** 测试用的时钟，保证 retrievedAt 可断言 */
  now?: () => number;
}

function toCandidate(
  doc: OpenLibraryDoc,
  retrievedAt: number,
): DedupeCandidate | null {
  const title = doc.title?.trim();
  if (!title) return null; // 无标题的脏数据直接丢弃（不撒谎：不编造条目）
  const workId = doc.key.replace(/^\/works\//, "");
  return {
    title,
    authors: doc.author_name ?? [],
    year: doc.first_publish_year ?? null,
    doi: doc.doi?.[0],
    isbn: doc.isbn?.[0],
    source: {
      kind: "openlibrary",
      label: "Open Library",
      sourceId: workId,
      retrievedAt,
    },
  };
}

/**
 * 按主题查询 Open Library。
 * 成功 → ok:true + candidates（可能为空数组：合法的"无结果"，不是失败）；
 * 网络/HTTP/解析失败 → ok:false + 分类后的 failure，绝不返回部分数据。
 */
export async function searchOpenLibrary(
  query: OpenLibraryQuery,
  options: OpenLibraryAdapterOptions = {},
): Promise<AdapterResponse> {
  const {
    baseUrl = "https://openlibrary.org",
    timeoutMs = 8000,
    transport = defaultTransport,
    now = () => Date.now(),
  } = options;

  const limit = Math.min(Math.max(query.limit ?? 12, 1), 100);
  const url = `${baseUrl}/search.json?q=${encodeURIComponent(query.topic)}&limit=${limit}&fields=key,title,author_name,first_publish_year,isbn,doi`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        failure: classifyHttpFailure(
          "openlibrary",
          response.status,
          body,
          response.headers.get("retry-after") ?? undefined,
        ),
      };
    }
    const json = (await response.json()) as OpenLibrarySearchResponse;
    const retrievedAt = now();
    const candidates = (json.docs ?? [])
      .map((doc) => toCandidate(doc, retrievedAt))
      .filter((c): c is DedupeCandidate => c !== null);
    return { ok: true, candidates };
  } catch (error) {
    return {
      ok: false,
      failure: classifyError("openlibrary", error, { query: query.topic }),
    };
  } finally {
    clearTimeout(timer);
  }
}
