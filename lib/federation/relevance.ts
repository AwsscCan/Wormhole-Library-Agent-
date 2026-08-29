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
  return [...items].sort((left, right) => {
    const score = federatedRelevanceScore(right, query) - federatedRelevanceScore(left, query);
    return score || left.id.localeCompare(right.id);
  });
}

/**
 * Keep the final list relevance-sorted while preventing one large provider
 * from consuming every visible slot. Quotas only choose the result window;
 * the returned window is sorted again by the same relevance score.
 */
export function selectFederatedItems(items: readonly EvidenceItem[], query: string, limit: number) {
  const ranked = rankFederatedItems(items, query);
  if (ranked.length <= limit) return ranked;

  const selected = new Map<string, EvidenceItem>();
  const quota = limit >= 4 ? Math.min(6, Math.max(1, Math.floor(limit / 4))) : 0;
  for (const kind of ["openlibrary", "user"] as const) {
    let count = 0;
    for (const item of ranked) {
      if (count >= quota) break;
      if (!item.sources.some((source) => source.kind === kind)) continue;
      selected.set(item.id, item);
      count += 1;
    }
  }

  for (const item of ranked) {
    if (selected.size >= limit) break;
    selected.set(item.id, item);
  }
  return rankFederatedItems([...selected.values()], query).slice(0, limit);
}
