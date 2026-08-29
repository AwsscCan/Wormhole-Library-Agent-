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
import type { Availability, Difficulty, Language, ResourceCard, ResourceType } from "@/lib/types";
import type { FederateOptions } from "./federation";
import { searchCatalogGateway } from "@/lib/catalog/gateway";
import type { EvidenceItem, SourceKind, SourceRef } from "./types";

const PROVENANCE_KIND: Record<SourceKind, SourceProvenance["sourceKind"]> = {
  openalex: "openalex",
  openlibrary: "openlibrary",
  seed: "seed",
  user: "library",
};
const SOURCE_LABELS: Record<SourceKind, string> = { openalex: "OpenAlex", openlibrary: "Open Library", seed: "本地种子", user: "用户" };
const SOURCE_PRIORITY: Record<SourceKind, number> = { openalex: 0, openlibrary: 1, seed: 2, user: 3 };
const PRIMARY_QUALITY: Record<SourceKind, number> = { openalex: 0.9, openlibrary: 0.85, seed: 0.6, user: 0.7 };

function toProvenance(source: SourceRef): SourceProvenance {
  return {
    sourceKind: PROVENANCE_KIND[source.kind],
    sourceLabel: source.label || SOURCE_LABELS[source.kind],
    retrievedAt: new Date(source.retrievedAt).toISOString(),
    externalId: source.sourceId,
  };
}
function inferResourceType(item: EvidenceItem): ResourceType { return item.doi ? "paper" : item.isbn ? "book" : "paper"; }
function inferLanguage(title: string): Language { return /[\u4e00-\u9fff]/.test(title) ? "zh" : "en"; }
function inferAvailability(kind: SourceKind): Availability { return kind === "seed" ? "available" : "online"; }
function inferDifficulty(kind: SourceKind): Difficulty { return kind === "seed" ? "undergrad" : "research"; }

export function toSourceTransparentResource(item: EvidenceItem): SourceTransparentResource {
  const sorted = [...item.sources].sort((a, b) => SOURCE_PRIORITY[a.kind] - SOURCE_PRIORITY[b.kind]);
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
function boolEnv(name: string): boolean { return process.env[name] === "1"; }

export interface SourceTransparentCatalogOptions { federate?: FederateOptions; }

export function createSourceTransparentCatalogAdapter(options: SourceTransparentCatalogOptions = {}): SourceTransparentCatalogPort {
  return {
    async searchTopic({ query, limit, ownerId }) {
      const base = options.federate ?? {};
      const federateOptions: FederateOptions = {
        ...base,
        includeOpenAlex: base.includeOpenAlex ?? !boolEnv("OPENALEX_DISABLED"),
        includeOpenLibrary: base.includeOpenLibrary ?? !boolEnv("OPENLIBRARY_DISABLED"),
        includeSeed: base.includeSeed ?? true,
        ownerId,
      };
      // Use the gateway here as well as in the legacy search adapter. This is
      // the important owner-scoped path for the research workspace: personal
      // OPAC/SRU/OAI-PMH sources must not disappear when the user searches from
      // a map node or starts a writing evidence run.
      const result = await searchCatalogGateway({ query, limit, ownerId }, federateOptions);
      const outcomes = result.sources.map((source) => ({ kind: source.kind, status: source.status }));
      const { sourceStatus, degraded } = deriveSourceStatus(outcomes);
      const sources: CatalogSourceStatus[] = outcomes.map((o) => ({ kind: PROVENANCE_KIND[o.kind], label: SOURCE_LABELS[o.kind], status: o.status }));
      const resources = result.records.map((record) => ({
        id: record.id,
        type: record.type,
        title: record.title,
        authors: [...record.authors],
        year: record.year,
        language: record.language,
        why: record.why,
        location: record.location,
        callNumber: record.callNumber,
        availability: record.availability,
        difficulty: record.difficulty,
        concepts: record.concepts,
        qualityScore: record.qualityScore,
        sourceUrl: record.sourceUrl,
        provenance: {
          sourceKind: PROVENANCE_KIND[record.sourceKind],
          sourceLabel: record.sourceLabel,
          retrievedAt: record.retrievedAt,
          externalId: record.externalId,
        },
        additionalProvenance: record.additionalSources.map(toProvenance),
      } satisfies SourceTransparentResource));
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

export function bindSourceTransparentCatalogAdapter(options: SourceTransparentCatalogOptions = {}): SourceTransparentCatalogPort {
  const port = createSourceTransparentCatalogAdapter(options);
  bindPackage02SourceCatalogPort(port);
  return port;
}
