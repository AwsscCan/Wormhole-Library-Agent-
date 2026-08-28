import { cosineSimilarity, hashedCharNgramEmbedding, type EmbedFn } from "./embedding";
import type { MemorySnippet, MemorySnippetMatch } from "./types";

/**
 * Private hybrid retrieval index (lexical + semantic, zero external tokens).
 *
 * - Snippets are hard-scoped by ownerId; a search can never cross owners.
 * - An optional sessionId narrows retrieval to that session only.
 * - deleteSnippet / forgetSession remove content from the index so it can
 *   never be recalled again, while the append-only event ledger keeps its
 *   history untouched.
 * - Semantic similarity uses a real local embedding (fastText-style character
 *   n-gram hashing by default, injectable for true neural embeddings), NOT
 *   shared-token TF cosine — so subword/character-level synonymy is recalled.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "it", "this", "that", "as",
  "at", "by", "from", "not", "but", "into", "about",
]);

type IndexEntry = { snippet: MemorySnippet; tokens: Set<string>; embedding: number[] };

type IndexState = { entries: Map<string, IndexEntry>; nextId: number };

const store = globalThis as unknown as { __package04MemoryIndex?: IndexState };

function state(): IndexState {
  if (!store.__package04MemoryIndex) {
    store.__package04MemoryIndex = { entries: new Map(), nextId: 1 };
  }
  return store.__package04MemoryIndex;
}

/** Deep-copy a flat DTO so callers can never mutate index-internal state. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Light English suffix folding so "incentives" matches "incentive". */
function stem(token: string): string {
  return token.replace(/(ing|ed|es|s)$/, "");
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map((token) => (/^[a-z]+$/.test(token) ? stem(token) : token));
}

function buildEntry(snippet: MemorySnippet, embed: EmbedFn): IndexEntry {
  const tokens = tokenize(snippet.text);
  return { snippet, tokens: new Set(tokens), embedding: embed(snippet.text) };
}

export type AddSnippetInput = Omit<MemorySnippet, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export function addMemorySnippet(
  input: AddSnippetInput,
  options: { embed?: EmbedFn } = {},
): MemorySnippet {
  if (!input.ownerId) throw new Error("MemorySnippet requires ownerId");
  const embed = options.embed ?? hashedCharNgramEmbedding;
  const s = state();
  const snippet: MemorySnippet = {
    ...input,
    id: input.id ?? `snip-${s.nextId++}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  if (s.entries.has(snippet.id)) {
    throw new Error(`MemorySnippet id already exists: ${snippet.id}`);
  }
  s.entries.set(snippet.id, buildEntry(snippet, embed));
  return clone(snippet);
}

export function deleteMemorySnippet(ownerId: string, snippetId: string): boolean {
  const s = state();
  const entry = s.entries.get(snippetId);
  if (!entry || entry.snippet.ownerId !== ownerId) return false;
  s.entries.delete(snippetId);
  return true;
}

/** Forget a whole session's private content; returns how many snippets dropped out. */
export function forgetSession(ownerId: string, sessionId: string): number {
  const s = state();
  let dropped = 0;
  for (const [id, entry] of s.entries) {
    if (entry.snippet.ownerId === ownerId && entry.snippet.sessionId === sessionId) {
      s.entries.delete(id);
      dropped += 1;
    }
  }
  return dropped;
}

function lexicalScore(queryTokens: string[], entry: IndexEntry): number {
  if (queryTokens.length === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) if (entry.tokens.has(token)) hits += 1;
  return hits / queryTokens.length;
}

/**
 * 最小混合分数阈值：过滤无关文本的嵌入噪声底（无关英文 ≈ 0.03），
 * 同时保留同义/形态召回（≈ 0.08-0.09 及以上）。
 */
const MIN_HYBRID_SCORE = 0.05;

/**
 * Hybrid retrieval: lexical containment + embedding cosine, then a
 * small-result-set rerank that blends relevance with recency. Lexical-only
 * mode is available for the required ablation experiment. The embedding
 * function is injectable (default: language-aware char n-gram hashing);
 * callers using a custom embedder must use the same one at add-time.
 */
export function searchPrivateMemory(
  input: {
    ownerId: string;
    sessionId?: string;
    query: string;
    limit: number;
    mode?: "hybrid" | "lexical-only";
  },
  options: { embed?: EmbedFn } = {},
): MemorySnippetMatch[] {
  const { ownerId, sessionId, query, limit } = input;
  const mode = input.mode ?? "hybrid";
  const embed = options.embed ?? hashedCharNgramEmbedding;
  const queryTokens = tokenize(query);
  const queryEmbedding = mode === "hybrid" ? embed(query) : [];

  const candidates: MemorySnippetMatch[] = [];
  for (const entry of state().entries.values()) {
    if (entry.snippet.ownerId !== ownerId) continue;
    if (sessionId !== undefined && entry.snippet.sessionId !== sessionId) continue;

    const lexical = lexicalScore(queryTokens, entry);
    if (mode === "lexical-only") {
      if (lexical <= 0) continue;
      candidates.push({ ...clone(entry.snippet), score: lexical, matchedVia: "lexical" });
      continue;
    }

    const semantic = cosineSimilarity(queryEmbedding, entry.embedding);
    const hybrid = 0.6 * lexical + 0.4 * semantic;
    if (hybrid < MIN_HYBRID_SCORE) continue;
    const matchedVia = lexical > 0 && semantic > 0 ? "both" : lexical > 0 ? "lexical" : "semantic";
    candidates.push({ ...clone(entry.snippet), score: hybrid, matchedVia });
  }

  // Small-result-set rerank: relevance first, recency breaks ties.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return candidates.slice(0, Math.max(0, limit));
}

export function countMemorySnippets(ownerId: string): number {
  let count = 0;
  for (const entry of state().entries.values()) {
    if (entry.snippet.ownerId === ownerId) count += 1;
  }
  return count;
}

export function getMemorySnippet(ownerId: string, snippetId: string): MemorySnippet | undefined {
  const entry = state().entries.get(snippetId);
  if (!entry || entry.snippet.ownerId !== ownerId) return undefined;
  return clone(entry.snippet);
}

export function resetMemoryIndexForTests(): void {
  store.__package04MemoryIndex = { entries: new Map(), nextId: 1 };
}

/**
 * 从持久化快照重建索引（供 persistence.restoreMemoryState 使用）。
 * 重新计算每条 snippet 的 token 集合与嵌入向量。
 */
export function rebuildIndexFromSnippets(snippets: MemorySnippet[]): void {
  const s = state();
  s.entries.clear();
  s.nextId = 1;
  for (const snippet of snippets) {
    s.entries.set(snippet.id, buildEntry(snippet, hashedCharNgramEmbedding));
  }
}
