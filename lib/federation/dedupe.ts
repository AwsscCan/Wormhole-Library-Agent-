import type { EvidenceItem, SourceRef } from "./types";

export interface DedupeCandidate {
  title: string;
  authors: readonly string[];
  year: number | null;
  doi?: string;
  isbn?: string;
  excerpt?: string;
  url?: string;
  source: SourceRef;
}

export interface DedupeReport {
  inputCount: number;
  outputCount: number;
  mergedCount: number;
  merges: ReadonlyArray<{ keptId: string; absorbedIds: readonly string[] }>;
}

export interface DedupeOutcome {
  items: readonly EvidenceItem[];
  report: DedupeReport;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s]/g, "").toUpperCase();
}

export function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "");
}

export function firstAuthorSurname(authors: readonly string[]): string {
  const first = authors[0]?.trim();
  if (!first) return "";
  const comma = first.split(",")[0]?.trim();
  if (comma && first.includes(",")) return comma.toLowerCase();
  const tokens = first.split(/\s+/).filter(Boolean);
  return (tokens[tokens.length - 1] ?? "").toLowerCase();
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function createStableId(input: {
  doi?: string;
  isbn?: string;
  title: string;
  authors: readonly string[];
}): string {
  if (input.doi) return `doi:${normalizeDoi(input.doi)}`;
  if (input.isbn) return `isbn:${normalizeIsbn(input.isbn)}`;
  return `title:${fnv1a(`${normalizeTitle(input.title)}|${firstAuthorSurname(input.authors)}`)}`;
}

const SOURCE_PRIORITY: Record<string, number> = { openalex: 0, openlibrary: 1, seed: 2, user: 3 };
function candidatePriority(c: DedupeCandidate): number { return SOURCE_PRIORITY[c.source.kind] ?? 9; }
function yearsMergeable(a: number | null, b: number | null): boolean { return a === null || b === null ? true : Math.abs(a - b) <= 1; }
function titleKey(c: DedupeCandidate): string { return `${normalizeTitle(c.title)}|${firstAuthorSurname(c.authors)}`; }

function mergeGroup(group: readonly DedupeCandidate[]): EvidenceItem {
  const sorted = [...group].sort((a, b) => candidatePriority(a) - candidatePriority(b));
  const primary = sorted[0];
  return {
    id: createStableId(primary),
    title: primary.title,
    authors: primary.authors,
    year: sorted.find((c) => c.year !== null)?.year ?? null,
    excerpt: sorted.find((c) => c.excerpt && c.excerpt.length > 0)?.excerpt ?? undefined,
    sources: sorted.map((c) => c.source),
    retrievedAt: Math.max(...sorted.map((c) => c.source.retrievedAt)),
    doi: sorted.find((c) => c.doi)?.doi,
    isbn: sorted.find((c) => c.isbn)?.isbn,
    url: sorted.find((c) => c.url)?.url ?? undefined,
  };
}

export function dedupeCandidates(candidates: readonly DedupeCandidate[]): DedupeOutcome {
  const byExact = new Map<string, DedupeCandidate[]>();
  const leftover: DedupeCandidate[] = [];
  for (const c of candidates) {
    let key: string | null = null;
    if (c.doi) key = `doi:${normalizeDoi(c.doi)}`;
    else if (c.isbn) key = `isbn:${normalizeIsbn(c.isbn)}`;
    if (key) {
      const bucket = byExact.get(key);
      if (bucket) bucket.push(c);
      else byExact.set(key, [c]);
    } else {
      leftover.push(c);
    }
  }

  const byTitle = new Map<string, DedupeCandidate[]>();
  for (const c of leftover) {
    const key = titleKey(c);
    const bucket = byTitle.get(key);
    if (bucket) {
      if (bucket.every((existing) => yearsMergeable(existing.year, c.year))) bucket.push(c);
      else byTitle.set(`${key}#${c.year ?? "ny"}`, [c]);
    } else {
      byTitle.set(key, [c]);
    }
  }

  const groups = [...byExact.values(), ...byTitle.values()];
  return {
    items: groups.map(mergeGroup),
    report: {
      inputCount: candidates.length,
      outputCount: groups.length,
      mergedCount: candidates.length - groups.length,
      merges: groups.filter((g) => g.length > 1).map((g) => {
        const sorted = [...g].sort((a, b) => candidatePriority(a) - candidatePriority(b));
        return { keptId: createStableId(sorted[0]), absorbedIds: sorted.slice(1).map((c) => createStableId(c)) };
      }),
    },
  };
}
