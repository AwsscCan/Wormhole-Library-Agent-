import type { ResourceCard } from "@/lib/types";
import { dedupeCandidates, type DedupeCandidate } from "./dedupe";
import { searchOpenAlexFederated, type OpenAlexFederatedOptions } from "./openAlexFederated";
import { searchOpenLibrary, type OpenLibraryAdapterOptions } from "./openLibraryAdapter";
import type { FederationFailure, FederationResult, SourceOutcome } from "./types";

export type SeedSearch = (query: { topic: string; limit: number }) => Promise<ResourceCard[]>;
export interface FederateQuery { topic: string; limit?: number; }
export interface FederateOptions {
  includeOpenAlex?: boolean;
  includeOpenLibrary?: boolean;
  includeSeed?: boolean;
  seedSearch?: SeedSearch;
  openAlex?: OpenAlexFederatedOptions;
  openLibrary?: OpenLibraryAdapterOptions;
  now?: () => number;
  ownerId?: string;
}

function seedCardToCandidate(card: ResourceCard, retrievedAt: number): DedupeCandidate {
  return {
    title: card.title,
    authors: [...card.authors],
    year: card.year ?? null,
    source: { kind: "seed", label: "本地种子", sourceId: card.id, retrievedAt },
  };
}

async function defaultSeedSearch(query: { topic: string; limit: number }): Promise<ResourceCard[]> {
  const { seedCatalogAdapter } = await import("@/lib/catalog/seedCatalogAdapter");
  return seedCatalogAdapter.searchCatalog({ query: query.topic, limit: query.limit });
}

export async function federateSearch(query: FederateQuery, options: FederateOptions = {}): Promise<FederationResult> {
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
  const outcomes: SourceOutcome[] = [];
  if (!includeOpenAlex) outcomes.push({ kind: "openalex", status: "disabled" });
  if (!includeOpenLibrary) outcomes.push({ kind: "openlibrary", status: "disabled" });
  if (!includeSeed) outcomes.push({ kind: "seed", status: "disabled" });

  const tasks: Array<Promise<{ candidates: DedupeCandidate[]; failure?: FederationFailure }>> = [];
  if (includeOpenAlex) {
    tasks.push(searchOpenAlexFederated({ topic: query.topic, limit }, { ...openAlex, now }).then((res) => {
      if (res.ok) {
        outcomes.push({ kind: "openalex", status: res.candidates.length > 0 ? "success" : "empty" });
        return { candidates: [...res.candidates] };
      }
      outcomes.push({ kind: "openalex", status: "failed" });
      return { candidates: [], failure: res.failure };
    }));
  }
  if (includeOpenLibrary) {
    tasks.push(searchOpenLibrary({ topic: query.topic, limit }, { ...openLibrary, now }).then((res) => {
      if (res.ok) {
        outcomes.push({ kind: "openlibrary", status: res.candidates.length > 0 ? "success" : "empty" });
        return { candidates: [...res.candidates] };
      }
      outcomes.push({ kind: "openlibrary", status: "failed" });
      return { candidates: [], failure: res.failure };
    }));
  }
  if (includeSeed) {
    tasks.push(seedSearch({ topic: query.topic, limit }).then((cards) => {
      outcomes.push({ kind: "seed", status: cards.length > 0 ? "success" : "empty" });
      return { candidates: cards.map((c) => seedCardToCandidate(c, retrievedAt)) };
    }).catch((error: unknown) => {
      outcomes.push({ kind: "seed", status: "failed" });
      return { candidates: [], failure: { kind: "unreachable" as const, source: "seed" as const, message: error instanceof Error ? error.message : String(error) } };
    }));
  }

  const settled = await Promise.all(tasks);
  const candidates = settled.flatMap((s) => s.candidates);
  const failures = settled.map((s) => s.failure).filter((f): f is FederationFailure => f !== undefined);
  const { items } = dedupeCandidates(candidates);
  return { items, failures, degraded: items.length === 0 && failures.length > 0, sourceOutcomes: outcomes };
}
