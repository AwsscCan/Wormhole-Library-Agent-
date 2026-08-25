import type { ExplorationFeedback, ExplorationFeedbackEvent } from "./types";

export type MemorySummaryResult =
  | { status: "available"; summary: string }
  | { status: "unavailable"; summary: null; message: string };

export interface MemoryReadPort {
  readSummary(input: { ownerId: string; sessionId: string }): Promise<MemorySummaryResult>;
}

export interface ExplorationEventPort {
  append(event: ExplorationFeedbackEvent): Promise<{ accepted: boolean }>;
}

const runtime = globalThis as unknown as {
  __workbenchMemoryReadPort?: MemoryReadPort;
  __workbenchExplorationEventPort?: ExplorationEventPort;
};

export function bindMemoryReadPort(port: MemoryReadPort) { runtime.__workbenchMemoryReadPort = port; }
export function bindExplorationEventPort(port: ExplorationEventPort) { runtime.__workbenchExplorationEventPort = port; }

export async function readMemorySummary(ownerId: string, sessionId: string): Promise<MemorySummaryResult> {
  if (!runtime.__workbenchMemoryReadPort) return {
    status: "unavailable", summary: null, message: "Memory summary port is not integrated",
  };
  return runtime.__workbenchMemoryReadPort.readSummary({ ownerId, sessionId });
}

export async function appendExplorationFeedback(input: Omit<ExplorationFeedbackEvent, "type"> & { feedback: ExplorationFeedback }) {
  if (!runtime.__workbenchExplorationEventPort) return { accepted: false, status: "unavailable" as const };
  const result = await runtime.__workbenchExplorationEventPort.append({ type: "exploration_recommendation_feedback", ...input });
  return { accepted: result.accepted, status: "recorded" as const };
}

export function clearWorkbenchPortsForTests() {
  delete runtime.__workbenchMemoryReadPort;
  delete runtime.__workbenchExplorationEventPort;
}
