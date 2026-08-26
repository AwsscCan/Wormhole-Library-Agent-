import type { ExplorationFeedback, ExplorationFeedbackEvent } from "./types";

export type MemorySummaryResult =
  | { status: "available"; snippets: MemorySnippet[]; preferences: InferredPreference[] }
  | { status: "unavailable"; snippets: []; preferences: []; message: string };

export type MemorySnippet = {
  id: string;
  sourceId: string;
  sessionId?: string;
  createdAt: string;
  text: string;
  score?: number;
};

export type InferredPreference = {
  id: string;
  key: string;
  value: unknown;
  confidence: number;
  evidenceCount: number;
  expiresAt?: string;
};

export interface MemoryReadPort {
  search(input: { ownerId: string; sessionId?: string; query: string; limit: number }): Promise<MemorySnippet[]>;
  listInferredPreferences(input: { ownerId: string }): Promise<InferredPreference[]>;
}

export interface ExplorationEventPort {
  append(event: ExplorationFeedbackEvent): Promise<{ accepted: boolean }>;
}

const runtime = globalThis as unknown as {
  __package04MemoryReadPort?: MemoryReadPort;
  __workbenchExplorationEventPort?: ExplorationEventPort;
};

export function bindPackage04MemoryReadPort(port: MemoryReadPort) { runtime.__package04MemoryReadPort = port; }
export function bindExplorationEventPort(port: ExplorationEventPort) { runtime.__workbenchExplorationEventPort = port; }

export async function readMemorySummary(ownerId: string, sessionId: string, query = "current research context"): Promise<MemorySummaryResult> {
  if (!runtime.__package04MemoryReadPort) return {
    status: "unavailable", snippets: [], preferences: [], message: "Package 04 MemoryReadPort is not integrated",
  };
  try {
    const [snippets, preferences] = await Promise.all([
      runtime.__package04MemoryReadPort.search({ ownerId, sessionId, query, limit: 8 }),
      runtime.__package04MemoryReadPort.listInferredPreferences({ ownerId }),
    ]);
    return { status: "available", snippets, preferences };
  } catch {
    return { status: "unavailable", snippets: [], preferences: [],
      message: "Package 04 MemoryReadPort failed; continuing without historical memory" };
  }
}

export async function appendExplorationFeedback(input: Omit<ExplorationFeedbackEvent, "type"> & { feedback: ExplorationFeedback }) {
  if (!runtime.__workbenchExplorationEventPort) return { accepted: false, status: "unavailable" as const };
  const result = await runtime.__workbenchExplorationEventPort.append({ type: "exploration_recommendation_feedback", ...input });
  return result.accepted ? { accepted: true, status: "recorded" as const } : { accepted: false, status: "rejected" as const };
}

export function clearWorkbenchPortsForTests() {
  delete runtime.__package04MemoryReadPort;
  delete runtime.__workbenchExplorationEventPort;
}
