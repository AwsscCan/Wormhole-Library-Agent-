import type { ResourceCard } from "@/lib/types";
import { federateSearch, type FederateOptions } from "@/lib/federation/federation";
import type { SourceKind, SourceOutcome } from "@/lib/federation/types";

export type CatalogGatewayStatus = SourceOutcome["status"];

export type CatalogGatewayRecord = ResourceCard & {
  sourceKind: SourceKind;
  sourceLabel: string;
  retrievedAt: string;
  externalId: string;
};

export type CatalogGatewaySource = {
  kind: SourceKind;
  label: string;
  status: CatalogGatewayStatus;
};

export type CatalogSearchResult = {
  records: CatalogGatewayRecord[];
  sources: CatalogGatewaySource[];
  degraded: boolean;
};

const SOURCE_LABELS: Record<SourceKind, string> = {
  openalex: "OpenAlex",
  openlibrary: "Open Library",
  seed: "本地种子",
  user: "用户",
};

function resourceType(item: { doi?: string; isbn?: string }): ResourceCard["type"] {
  return item.doi ? "paper" : item.isbn ? "book" : "paper";
}

function availability(kind: SourceKind): ResourceCard["availability"] {
  return kind === "seed" ? "available" : "online";
}

export async function searchCatalogGateway(
  input: { query: string; limit?: number },
  options: FederateOptions = {},
): Promise<CatalogSearchResult> {
  const result = await federateSearch({ topic: input.query, limit: input.limit }, options);
  const sources = (result.sourceOutcomes ?? []).map((source) => ({
    kind: source.kind,
    label: SOURCE_LABELS[source.kind],
    status: source.status,
  }));
  const records = result.items.map((item) => {
    const primary = [...item.sources].sort((left, right) => {
      const rank: Record<SourceKind, number> = { openalex: 0, openlibrary: 1, seed: 2, user: 3 };
      return rank[left.kind] - rank[right.kind];
    })[0]!;
    return {
      id: item.id,
      type: resourceType(item),
      title: item.title,
      authors: [...item.authors],
      ...(item.year === null ? {} : { year: item.year }),
      language: /[\u4e00-\u9fff]/.test(item.title) ? "zh" : "en",
      why: item.excerpt ?? `来源「${SOURCE_LABELS[primary.kind]}」检索命中。`,
      availability: availability(primary.kind),
      difficulty: primary.kind === "seed" ? "undergrad" : "research",
      concepts: [],
      qualityScore: primary.kind === "seed" ? 0.6 : 0.85,
      ...(item.url ? { sourceUrl: item.url } : {}),
      sourceKind: primary.kind,
      sourceLabel: SOURCE_LABELS[primary.kind],
      retrievedAt: new Date(item.retrievedAt).toISOString(),
      externalId: primary.sourceId,
    } satisfies CatalogGatewayRecord;
  });
  return { records, sources, degraded: sources.some((source) => source.status === "failed") };
}
