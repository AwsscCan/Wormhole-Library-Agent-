import { getSemanticEmbedderStatus, searchPrivateMemory } from "./indexStore";
import { listInferredPreferences } from "./inference";
import { listLearningEvents } from "./ledger";
import { snapshotMemoryState } from "./persistence";
import type { LearningEvent, MemorySnippet, MemorySnippetMatch } from "./types";

export type HybridMemoryInsights = {
  semantic: ReturnType<typeof getSemanticEmbedderStatus>;
  totals: { events: number; snippets: number; preferences: number };
  events: LearningEvent[];
  snippets: MemorySnippet[];
  preferences: ReturnType<typeof listInferredPreferences>;
  retrieval: { query: string; matches: MemorySnippetMatch[] };
};

function latestQuery(events: LearningEvent[], snippets: MemorySnippet[]): string {
  const query = [...events].reverse().find((event) => event.query?.trim())?.query;
  if (query) return query;
  const concept = [...events].reverse().find((event) => event.conceptId)?.conceptId;
  if (concept) return concept;
  return snippets.at(-1)?.text.slice(0, 160) ?? "current research context";
}

export async function buildHybridMemoryInsights(
  ownerId: string,
  options: { sessionId?: string; query?: string } = {},
): Promise<HybridMemoryInsights> {
  const snapshot = snapshotMemoryState();
  const allEvents = listLearningEvents({ ownerId });
  const allSnippets = snapshot.snippets.filter((snippet) => snippet.ownerId === ownerId);
  const preferences = listInferredPreferences(ownerId);
  const visibleEvents = options.sessionId
    ? allEvents.filter((event) => event.sessionId === options.sessionId)
    : allEvents;
  const query = options.query?.trim() || latestQuery(allEvents, allSnippets);
  const matches = await searchPrivateMemory({ ownerId, query, limit: 8 });

  return {
    semantic: getSemanticEmbedderStatus(),
    totals: { events: allEvents.length, snippets: allSnippets.length, preferences: preferences.length },
    events: visibleEvents.slice(-24).reverse(),
    snippets: allSnippets.slice(-16).reverse(),
    preferences,
    retrieval: { query, matches },
  };
}
