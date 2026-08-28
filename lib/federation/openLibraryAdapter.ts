import type { DedupeCandidate } from "./dedupe";
import { classifyError, classifyHttpFailure } from "./failures";
import type { AdapterResponse } from "./types";

interface OpenLibraryDoc {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  doi?: string[];
}

interface OpenLibrarySearchResponse { docs?: OpenLibraryDoc[]; }

export type Transport = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;
const defaultTransport: Transport = (url, init) => fetch(url, init);

export interface OpenLibraryQuery { topic: string; limit?: number; }
export interface OpenLibraryAdapterOptions { baseUrl?: string; timeoutMs?: number; transport?: Transport; now?: () => number; }

function toCandidate(doc: OpenLibraryDoc, retrievedAt: number): DedupeCandidate | null {
  const title = doc.title?.trim();
  if (!title) return null;
  const workId = doc.key.replace(/^\/works\//, "");
  return {
    title,
    authors: doc.author_name ?? [],
    year: doc.first_publish_year ?? null,
    doi: doc.doi?.[0],
    isbn: doc.isbn?.[0],
    source: { kind: "openlibrary", label: "Open Library", sourceId: workId, retrievedAt },
  };
}

export async function searchOpenLibrary(query: OpenLibraryQuery, options: OpenLibraryAdapterOptions = {}): Promise<AdapterResponse> {
  const { baseUrl = "https://openlibrary.org", timeoutMs = 8000, transport = defaultTransport, now = () => Date.now() } = options;
  const limit = Math.min(Math.max(query.limit ?? 12, 1), 100);
  const url = `${baseUrl}/search.json?q=${encodeURIComponent(query.topic)}&limit=${limit}&fields=key,title,author_name,first_publish_year,isbn,doi`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, failure: classifyHttpFailure("openlibrary", response.status, body, response.headers.get("retry-after") ?? undefined) };
    }
    const json = (await response.json()) as OpenLibrarySearchResponse;
    const retrievedAt = now();
    const candidates = (json.docs ?? []).map((doc) => toCandidate(doc, retrievedAt)).filter((c): c is DedupeCandidate => c !== null);
    return { ok: true, candidates };
  } catch (error) {
    return { ok: false, failure: classifyError("openlibrary", error, { query: query.topic }) };
  } finally {
    clearTimeout(timer);
  }
}
