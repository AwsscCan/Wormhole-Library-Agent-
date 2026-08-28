/**
 * 来源透明目录端口 adapter（package 02 → package 05）。
 *
 * 把联邦层（EvidenceItem / FederationResult）投影成 package 05 可直接消费的
 * `SourceTransparentCatalogPort.searchTopic()`：
 *  - 每条 EvidenceItem → SourceTransparentResource（ResourceCard 必填字段 + 主/附加 provenance）
 *  - 每个启用源显式记录 success / empty / failed / disabled 状态矩阵
 *  - 汇总为 sourceStatus: live | partial | unavailable（degraded 与之对齐）
 *
 * 这是验收报告 F-001 / F-002 的落地：不再是平行 API，而是可绑定的跨包端口。
 */

import {
  bindPackage02SourceCatalogPort,
  type SourceTransparentCatalogPort,
} from "@/lib/research/catalogPort";
import type {
  CatalogSourceStatus,
  SourceProvenance,
  SourceTransparentResource,
  TopicLibraryResult,
} from "@/lib/research/types";
import type {
  Availability,
  Difficulty,
  Language,
  ResourceCard,
  ResourceType,
} from "@/lib/types";
import { federateSearch, type FederateOptions } from "./federation";
import type { EvidenceItem, SourceKind, SourceRef } from "./types";

/** 联邦层 SourceKind → 契约层 sourceKind（user 笔记并入 "library" 馆藏类别）。 */
const PROVENANCE_KIND: Record<SourceKind, SourceProvenance["sourceKind"]> = {
  openalex: "openalex",
  openlibrary: "openlibrary",
  seed: "seed",
  user: "library",
};

const SOURCE_LABELS: Record<SourceKind, string> = {
  openalex: "OpenAlex",
  openlibrary: "Open Library",
  seed: "本地种子",
  user: "用户",
};

/** 主 provenance 挑选优先级：真实学术源 > 书目源 > 本地种子 > 用户笔记。 */
const SOURCE_PRIORITY: Record<SourceKind, number> = {
  openalex: 0,
  openlibrary: 1,
  seed: 2,
  user: 3,
};

/** 主来源决定的基础质量分（doi 命中额外加权在投影时叠加）。 */
const PRIMARY_QUALITY: Record<SourceKind, number> = {
  openalex: 0.9,
  openlibrary: 0.85,
  seed: 0.6,
  user: 0.7,
};

function toProvenance(source: SourceRef): SourceProvenance {
  return {
    sourceKind: PROVENANCE_KIND[source.kind],
    sourceLabel: source.label || SOURCE_LABELS[source.kind],
    retrievedAt: new Date(source.retrievedAt).toISOString(),
    externalId: source.sourceId,
  };
}

function inferResourceType(item: EvidenceItem): ResourceType {
  if (item.doi) return "paper";
  if (item.isbn) return "book";
  return "paper";
}

function inferLanguage(title: string): Language {
  return /[\u4e00-\u9fff]/.test(title) ? "zh" : "en";
}

function inferAvailability(kind: SourceKind): Availability {
  // 远端学术/书目源天然在线；本地种子按馆藏可得。
  return kind === "seed" ? "available" : "online";
}

function inferDifficulty(kind: SourceKind): Difficulty {
  // 联邦命中默认按研究语境处理；本地种子偏低年级。
  return kind === "seed" ? "undergrad" : "research";
}

/**
 * 把一条（可能多来源合并后的）EvidenceItem 投影为 SourceTransparentResource。
 * 主 provenance 取优先级最高的来源；其余来源诚实写入 additionalProvenance。
 */
export function toSourceTransparentResource(item: EvidenceItem): SourceTransparentResource {
  const sorted = [...item.sources].sort(
    (a, b) => SOURCE_PRIORITY[a.kind] - SOURCE_PRIORITY[b.kind],
  );
  const primary = sorted[0]!;
  const additional = sorted.slice(1).map(toProvenance);

  const card: ResourceCard = {
    id: item.id,
    type: inferResourceType(item),
    title: item.title,
    authors: [...item.authors],
    year: item.year ?? undefined,
    language: inferLanguage(item.title),
    why: item.excerpt ?? "来源联邦检索命中，与你当前研究主题相关。",
    availability: inferAvailability(primary.kind),
    difficulty: inferDifficulty(primary.kind),
    concepts: [],
    qualityScore: item.doi ? 0.9 : PRIMARY_QUALITY[primary.kind],
    sourceUrl: item.url,
  };

  const resource: SourceTransparentResource = { ...card, provenance: toProvenance(primary) };
  if (additional.length > 0) resource.additionalProvenance = additional;
  return resource;
}

/** 从逐源结局矩阵推导整体 sourceStatus。 */
function deriveSourceStatus(
  outcomes: readonly { kind: SourceKind; status: "success" | "empty" | "failed" | "disabled" }[],
): { sourceStatus: TopicLibraryResult["sourceStatus"]; degraded: boolean } {
  const enabled = outcomes.filter((o) => o.status !== "disabled");
  if (enabled.length === 0) return { sourceStatus: "unavailable", degraded: true };

  const failed = enabled.filter((o) => o.status === "failed");
  const responded = enabled.filter((o) => o.status === "success" || o.status === "empty");
  if (responded.length === 0) return { sourceStatus: "unavailable", degraded: true };
  if (failed.length > 0) return { sourceStatus: "partial", degraded: true };
  return { sourceStatus: "live", degraded: false };
}

function boolEnv(name: string): boolean {
  return process.env[name] === "1";
}

export interface SourceTransparentCatalogOptions {
  /** 转发给 federateSearch 的选项（测试注入 stub / 环境开关）。 */
  federate?: FederateOptions;
}

/**
 * 构造 package 05 可绑定的目录端口实现（由联邦层驱动）。
 */
export function createSourceTransparentCatalogAdapter(
  options: SourceTransparentCatalogOptions = {},
): SourceTransparentCatalogPort {
  return {
    async searchTopic({ query, limit }) {
      const base = options.federate ?? {};
      const federateOptions: FederateOptions = {
        ...base,
        includeOpenAlex: base.includeOpenAlex ?? !boolEnv("OPENALEX_DISABLED"),
        includeOpenLibrary: base.includeOpenLibrary ?? !boolEnv("OPENLIBRARY_DISABLED"),
        includeSeed: base.includeSeed ?? true,
      };

      const result = await federateSearch({ topic: query, limit }, federateOptions);
      const outcomes = [...(result.sourceOutcomes ?? [])];
      const { sourceStatus, degraded } = deriveSourceStatus(outcomes);

      const sources: CatalogSourceStatus[] = outcomes.map((o) => ({
        kind: PROVENANCE_KIND[o.kind],
        label: SOURCE_LABELS[o.kind],
        status: o.status,
      }));

      const resources = result.items.map(toSourceTransparentResource);

      let message: string | undefined;
      if (sourceStatus === "unavailable") {
        message = outcomes.every((o) => o.status === "disabled")
          ? "没有启用任何馆藏来源。"
          : "所有馆藏来源均不可用，未返回结果。";
      } else if (resources.length === 0) {
        message = "已查询所有启用的馆藏来源，但没有找到相关资源。";
      } else if (sourceStatus === "partial") {
        message = "部分馆藏来源不可用，结果可能不完整。";
      }

      return { resources, sourceStatus, degraded, message, sources };
    },
  };
}

/**
 * P01 composition 绑定入口：把联邦层目录端口绑定到全局 catalog port，
 * 之后 package 05 经 `queryTopicLibrary()` 即能拿到真实来源透明结果。
 */
export function bindSourceTransparentCatalogAdapter(
  options: SourceTransparentCatalogOptions = {},
): SourceTransparentCatalogPort {
  const port = createSourceTransparentCatalogAdapter(options);
  bindPackage02SourceCatalogPort(port);
  return port;
}
