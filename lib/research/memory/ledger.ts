import type { LearningEvent } from "./types";

/**
 * Append-only learning event ledger.
 *
 * Events can never be mutated or removed once appended; the only query
 * surface is owner-scoped (optionally session-scoped) listing.
 */

type LedgerState = { events: LearningEvent[]; nextId: number };

const store = globalThis as unknown as { __package04LearningLedger?: LedgerState };

function state(): LedgerState {
  if (!store.__package04LearningLedger) {
    store.__package04LearningLedger = { events: [], nextId: 1 };
  }
  return store.__package04LearningLedger;
}

export type AppendLearningEventInput = Omit<LearningEvent, "id" | "at"> & {
  id?: string;
  at?: string;
};

export function appendLearningEvent(input: AppendLearningEventInput): LearningEvent {
  if (!input.ownerId) throw new Error("LearningEvent requires ownerId");
  const s = state();
  const event: LearningEvent = {
    ...input,
    id: input.id ?? `le-${s.nextId++}`,
    at: input.at ?? new Date().toISOString(),
  };
  s.events.push(event);
  return event;
}

/** Owner-scoped read. Cross-owner queries are impossible by construction. */
export function listLearningEvents(filter: {
  ownerId: string;
  sessionId?: string;
  since?: string;
}): LearningEvent[] {
  const { ownerId, sessionId, since } = filter;
  return state().events.filter((event) => {
    if (event.ownerId !== ownerId) return false;
    if (sessionId !== undefined && event.sessionId !== sessionId) return false;
    if (since !== undefined && event.at < since) return false;
    return true;
  });
}

export function findLearningEvent(ownerId: string, eventId: string): LearningEvent | undefined {
  return state().events.find((event) => event.ownerId === ownerId && event.id === eventId);
}

export function resetLearningLedgerForTests(): void {
  store.__package04LearningLedger = { events: [], nextId: 1 };
}
