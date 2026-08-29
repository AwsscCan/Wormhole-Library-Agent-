import type { DedupeCandidate } from "./dedupe";
import { classifyError, classifyHttpFailure } from "./failures";
import type { AdapterResponse } from "./types";

interface OpenAlexWork {
  id: string;
  doi?: string | null;
  display_name: string;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string } }[];
  abstract_inverted_index?: Record<string, number[]> | null;
}

interface OpenAlexWorksResponse {
  results?: OpenAlexWork[];
}

export type Transport = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;
const defaultTransport: Transport = (url, init) => fetch(url, init);

export interface OpenAlexQuery { topic: string; limit?: number; }
export interface OpenAlexFederatedOptions { baseUrl?: string; timeoutMs?: number; transport?: Transport; now?: () => number; }

function toCandidate(work: OpenAlexWork, retrievedAt: number): DedupeCandidate | null {
  const title = work.display_name?.trim();
  if (!title || !work.id) return null;
  const authors = (work.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean);
  const doi = work.doi?.replace(/^https?:\/\/doi\.org\//, "");
  const words = Object.entries(work.abstract_inverted_index ?? {}).flatMap(([word, positions]) => positions.map((position) => ({ word, position })));
  words.sort((left, right) => left.position - right.position);
  const abstract = words.map(({ word }) => word).join(" ").slice(0, 1200);
  return {
    title, authors, year: work.publication_year ?? null, doi, ...(abstract ? { excerpt: abstract } : {}),
    url: work.doi ?? `https://openalex.org/${work.id.replace("https://openalex.org/", "")}`,
    source: { kind: "openalex", label: "OpenAlex", sourceId: work.id.replace("https://openalex.org/", ""), retrievedAt },
  };
}

export async function searchOpenAlexFederated(query: OpenAlexQuery, options: OpenAlexFederatedOptions = {}): Promise<AdapterResponse> {
  const { baseUrl = "https://api.openalex.org/works", timeoutMs = 12000, transport = defaultTransport, now = () => Date.now() } = options;
  if (!query.topic.trim()) return { ok: true, candidates: [] };
  const limit = Math.min(Math.max(query.limit ?? 12, 1), 100);
  const url = `${baseUrl}?search=${encodeURIComponent(query.topic)}&per-page=${limit}&select=id,doi,display_name,publication_year,authorships,abstract_inverted_index&mailto=${encodeURIComponent("wormhole-library-agent@example.com")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, failure: classifyHttpFailure("openalex", response.status, body, response.headers.get("retry-after") ?? undefined) };
    }
    const json = (await response.json()) as OpenAlexWorksResponse;
    const retrievedAt = now();
    const candidates = (json.results ?? []).map((work) => toCandidate(work, retrievedAt)).filter((c): c is DedupeCandidate => c !== null);
    return { ok: true, candidates };
  } catch (error) {
    return { ok: false, failure: classifyError("openalex", error, { query: query.topic }) };
  } finally {
    clearTimeout(timer);
  }
}
