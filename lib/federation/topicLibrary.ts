/**
 * 主题馆藏服务（v3.2 package 02 / M6）
 *
 * federateSearch 的 API 门面：环境开关（OPENALEX_DISABLED / OPENLIBRARY_DISABLED）
 * + 失败文案（getFailureMessage）+ 来源摘要（前端徽标用）。
 * 环境开关与 lib/catalog/openAlexAdapter.ts 的 OPENALEX_DISABLED 约定保持一致。
 */

import { federateSearch, type FederateOptions } from "./federation";
import { getFailureMessage } from "./failures";
import type { EvidenceItem, FederationFailure, SourceKind } from "./types";

/** 来源摘要条目（前端徽标：哪个源参与了、健康与否） */
export interface SourceSummary {
  kind: SourceKind;
  label: string;
  ok: boolean;
}

export interface LibraryTopicResponse {
  topic: string;
  items: readonly EvidenceItem[];
  failures: readonly FederationFailure[];
  /** 每条失败的品牌文案（中文、可操作），给前端直接展示 */
  failureMessages: readonly string[];
  degraded: boolean;
  sources: readonly SourceSummary[];
}

export interface TopicLibraryInput {
  topic: string;
  limit?: number;
}

const SOURCE_LABELS: Record<SourceKind, string> = {
  openalex: "OpenAlex",
  openlibrary: "Open Library",
  seed: "本地种子",
  user: "用户",
};

function boolEnv(name: string): boolean {
  return process.env[name] === "1";
}

/** 查询主题馆藏（多源联邦 + 去重 + 诚实降级） */
export async function getTopicLibrary(
  input: TopicLibraryInput,
  options: FederateOptions = {},
): Promise<LibraryTopicResponse> {
  const result = await federateSearch(
    { topic: input.topic, limit: input.limit },
    {
      ...options,
      includeOpenAlex:
        options.includeOpenAlex ?? !boolEnv("OPENALEX_DISABLED"),
      includeOpenLibrary:
        options.includeOpenLibrary ?? !boolEnv("OPENLIBRARY_DISABLED"),
    },
  );

  const failedSources = new Set(result.failures.map((f) => f.source));
  const attempted = new Set<SourceKind>();
  for (const item of result.items) {
    for (const s of item.sources) attempted.add(s.kind);
  }
  for (const f of result.failures) attempted.add(f.source);

  const sources: SourceSummary[] = Array.from(attempted).map((kind) => ({
    kind,
    label: SOURCE_LABELS[kind],
    ok: !failedSources.has(kind),
  }));

  return {
    topic: input.topic,
    items: result.items,
    failures: result.failures,
    failureMessages: result.failures.map(getFailureMessage),
    degraded: result.degraded,
    sources,
  };
}
