import "server-only";
import type { ResourceCard } from "@/lib/types";
import { federateSearch, type FederateOptions } from "@/lib/federation/federation";
import { dedupeCandidates, type DedupeCandidate } from "@/lib/federation/dedupe";
import { listCatalogSources } from "./sourceRepository";
import type { SourceKind, SourceOutcome } from "@/lib/federation/types";

export type CatalogGatewayStatus = SourceOutcome["status"];
export type CatalogGatewayRecord = ResourceCard & { sourceKind: SourceKind; sourceLabel: string; retrievedAt: string; externalId: string };
export type CatalogGatewaySource = { kind: SourceKind; label: string; status: CatalogGatewayStatus };
export type CatalogSearchResult = { records: CatalogGatewayRecord[]; sources: CatalogGatewaySource[]; degraded: boolean };

const SOURCE_LABELS: Record<SourceKind, string> = { openalex: "OpenAlex", openlibrary: "Open Library", seed: "本地种子", user: "个人馆藏" };
const SOURCE_PRIORITY: Record<SourceKind, number> = { openalex: 0, openlibrary: 1, seed: 2, user: 3 };

function resourceType(item: { doi?: string; isbn?: string }): ResourceCard["type"] { return item.doi ? "paper" : item.isbn ? "book" : "paper"; }
function availability(kind: SourceKind): ResourceCard["availability"] { return kind === "seed" ? "available" : "online"; }

async function searchPersonalSource(source: { id: string; name: string; protocol: string; endpoint: string }, query: string, limit: number, retrievedAt: number): Promise<DedupeCandidate[]> {
  if (source.protocol === "z3950" || source.protocol === "import") return [];
  const url = new URL(source.endpoint);
  if (source.protocol === "oai_pmh") { url.searchParams.set("verb", "ListRecords"); url.searchParams.set("metadataPrefix", "oai_dc"); }
  else url.searchParams.set("q", query);
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json, application/xml, text/xml" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("xml") || source.protocol === "sru" || source.protocol === "oai_pmh") {
    const xml = await response.text();
    const titles = [...xml.matchAll(/<(?:dc:)?title[^>]*>([^<]+)</gi)].map((match) => match[1].trim()).filter(Boolean).slice(0, limit);
    return titles.map((title, index) => ({ title, authors: [], year: null, url: source.endpoint, source: { kind: "user", label: source.name, sourceId: `${source.id}:${index}`, retrievedAt } }));
  }
  const payload = await response.json() as { results?: Array<Record<string, unknown>>; records?: Array<Record<string, unknown>>; docs?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  const records = Array.isArray(payload) ? payload : payload.results ?? payload.records ?? payload.docs ?? [];
  return records.slice(0, limit).map((record, index): DedupeCandidate | null => {
    const title = String(record.title ?? record.name ?? "").trim(); if (!title) return null;
    const authorsValue = record.authors ?? record.author ?? [];
    const authors = Array.isArray(authorsValue) ? authorsValue.map(String) : [String(authorsValue)].filter(Boolean);
    const sourceUrl = String(record.url ?? record.link ?? record.sourceUrl ?? source.endpoint);
    return { title, authors, year: Number.isFinite(Number(record.year)) ? Number(record.year) : null, excerpt: String(record.abstract ?? record.description ?? "").slice(0, 600) || undefined, url: sourceUrl, source: { kind: "user", label: source.name, sourceId: String(record.id ?? record.identifier ?? `${source.id}:${index}`), retrievedAt } };
  }).filter((item): item is DedupeCandidate => item !== null);
}

export async function searchCatalogGateway(input: { query: string; limit?: number; ownerId?: string }, options: FederateOptions = {}): Promise<CatalogSearchResult> {
  const result = await federateSearch({ topic: input.query, limit: input.limit }, options);
  const customSources = input.ownerId ? await listCatalogSources({ id: input.ownerId.replace(/^(member|guest):/, ""), mode: input.ownerId.startsWith("member:") ? "member" : "guest" }) : [];
  const customResults = await Promise.allSettled(customSources.map((source) => searchPersonalSource(source, input.query, input.limit ?? 12, Date.now())));
  const customOutcomes: CatalogGatewaySource[] = customResults.map((outcome, index) => ({ kind: "user", label: customSources[index].name, status: outcome.status === "fulfilled" ? outcome.value.length ? "success" : "empty" : "failed" }));
  const customCandidates = customResults.flatMap((outcome) => outcome.status === "fulfilled" ? outcome.value : []);
  const baseCandidates: DedupeCandidate[] = result.items.flatMap((item) => item.sources.map((source) => ({ title: item.title, authors: item.authors, year: item.year, excerpt: item.excerpt, doi: item.doi, isbn: item.isbn, url: item.url, source })));
  const merged = dedupeCandidates([...baseCandidates, ...customCandidates]).items;
  const sources = [...(result.sourceOutcomes ?? []).map((source) => ({ kind: source.kind, label: SOURCE_LABELS[source.kind], status: source.status })), ...customOutcomes];
  const records = merged.map((item) => {
    const primary = [...item.sources].sort((left, right) => SOURCE_PRIORITY[left.kind] - SOURCE_PRIORITY[right.kind])[0]!;
    const sourceLabel = primary.label || SOURCE_LABELS[primary.kind];
    return {
      id: item.id, type: resourceType(item), title: item.title, authors: [...item.authors], ...(item.year === null ? {} : { year: item.year }),
      language: /[\u4e00-\u9fff]/.test(item.title) ? "zh" : "en", why: item.excerpt ?? `来源「${sourceLabel}」检索命中。`, availability: availability(primary.kind), difficulty: primary.kind === "seed" ? "undergrad" : "research", concepts: [], qualityScore: primary.kind === "seed" ? 0.6 : 0.85, ...(item.url ? { sourceUrl: item.url } : {}), sourceKind: primary.kind, sourceLabel, retrievedAt: new Date(item.retrievedAt).toISOString(), externalId: primary.sourceId,
    } satisfies CatalogGatewayRecord;
  });
  return { records, sources, degraded: sources.some((source) => source.status === "failed") };
}
