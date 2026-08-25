import type { MemorySnippet, MemorySnippetMatch } from "./types";

/**
 * Private hybrid retrieval index (lexical + semantic, zero tokens).
 *
 * - Snippets are hard-scoped by ownerId; a search can never cross owners.
 * - An optional sessionId narrows retrieval to that session only.
 * - deleteSnippet / forgetSession remove content from the index so it can
 *   never be recalled again, while the append-only event ledger keeps its
 *   history untouched.
 * - Semantic similarity is a local TF cosine over token vectors — no model
 *   calls, keeping the zero-token core path.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "it", "this", "that", "as",
  "at", "by", "from", "not", "but", "into", "about",
]);

type IndexEntry = { snippet: MemorySnippet; tokens: Set<string>; tf: Map<string, number> };

type IndexState = { entries: Map<string, IndexEntry>; nextId: number };

const store = globalThis as unknown as { __package04MemoryIndex?: IndexState };

function state(): IndexState {
  if (!store.__package04MemoryIndex) {
    store.__package04MemoryIndex = { entries: new Map(), nextId: 1 };
  }
  return store.__package04MemoryIndex;
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

function buildEntry(snippet: MemorySnippet): IndexEntry {
  const tokens = tokenize(snippet.text);
  const tf = new Map<string, number>();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  return { snippet, tokens: new Set(tokens), tf };
}

export type AddSnippetInput = Omit<MemorySnippet, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export function addMemorySnippet(input: AddSnippetInput): MemorySnippet {
  if (!input.ownerId) throw new Error("MemorySnippet requires ownerId");
  const s = state();
  const snippet: MemorySnippet = {
    ...input,
    id: input.id ?? `snip-${s.nextId++}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  s.entries.set(snippet.id, buildEntry(snippet));
  return snippet;
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

function cosine(tfA: Map<string, number>, tfB: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const value of tfA.values()) normA += value * value;
  for (const value of tfB.values()) normB += value * value;
  if (normA === 0 || normB === 0) return 0;
  for (const [token, value] of tfA) {
    const other = tfB.get(token);
    if (other !== undefined) dot += value * other;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Hybrid retrieval: lexical containment + TF cosine, then a small-result-set
 * rerank that blends relevance with recency. Lexical-only mode is available
 * for the required ablation experiment.
 */
export function searchPrivateMemory(input: {
  ownerId: string;
  sessionId?: string;
  query: string;
  limit: number;
  mode?: "hybrid" | "lexical-only";
}): MemorySnippetMatch[] {
  const { ownerId, sessionId, query, limit } = input;
  const mode = input.mode ?? "hybrid";
  const queryTokens = tokenize(query);
  const queryTf = new Map<string, number>();
  for (const token of queryTokens) queryTf.set(token, (queryTf.get(token) ?? 0) + 1);

  const candidates: MemorySnippetMatch[] = [];
  for (const entry of state().entries.values()) {
    if (entry.snippet.ownerId !== ownerId) continue;
    if (sessionId !== undefined && entry.snippet.sessionId !== sessionId) continue;

    const lexical = lexicalScore(queryTokens, entry);
    if (mode === "lexical-only") {
      if (lexical <= 0) continue;
      candidates.push({ ...entry.snippet, score: lexical, matchedVia: "lexical" });
      continue;
    }

    const semantic = cosine(queryTf, entry.tf);
    const hybrid = 0.6 * lexical + 0.4 * semantic;
    if (hybrid <= 0) continue;
    const matchedVia = lexical > 0 && semantic > 0 ? "both" : lexical > 0 ? "lexical" : "semantic";
    candidates.push({ ...entry.snippet, score: hybrid, matchedVia });
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
  return entry.snippet;
}

export function resetMemoryIndexForTests(): void {
  store.__package04MemoryIndex = { entries: new Map(), nextId: 1 };
}
