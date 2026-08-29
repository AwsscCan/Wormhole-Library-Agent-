import type { EvidenceItem, SourceKind } from "./types";

const SOURCE_PRIORITY: Record<SourceKind, number> = { openalex: 0, openlibrary: 1, seed: 2, user: 3 };
const QUERY_STOP_WORDS = new Set(["a", "an", "and", "are", "for", "from", "in", "of", "on", "the", "to", "with", "相关", "研究", "关于"]);

function queryTerms(value: string) {
  return (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((term) => term.length > 1 && !QUERY_STOP_WORDS.has(term));
}

export function federatedRelevanceScore(item: Pick<EvidenceItem, "title" | "excerpt" | "sources">, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const title = item.title.toLocaleLowerCase();
  const excerpt = item.excerpt?.toLocaleLowerCase() ?? "";
  const terms = queryTerms(normalizedQuery);
  const titleHits = terms.filter((term) => title.includes(term)).length;
  const excerptHits = terms.filter((term) => excerpt.includes(term)).length;
  const coverage = terms.length ? titleHits / terms.length : 0;
  const primaryKind = [...item.sources].sort((left, right) => SOURCE_PRIORITY[left.kind] - SOURCE_PRIORITY[right.kind])[0]?.kind ?? "seed";
  return (normalizedQuery && title.includes(normalizedQuery) ? 6 : 0)
    + coverage * 4
    + titleHits * 0.35
    + Math.min(1.2, excerptHits * 0.2)
    + (primaryKind === "openalex" ? 0.35 : primaryKind === "openlibrary" ? 0.18 : primaryKind === "user" ? 0.12 : 0);
}

export function rankFederatedItems(items: readonly EvidenceItem[], query: string) {
  return [...items].sort((left, right) => federatedRelevanceScore(right, query) - federatedRelevanceScore(left, query));
}
