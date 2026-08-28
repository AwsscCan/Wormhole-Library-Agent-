import { listLearningEvents } from "./ledger";
import type { InferredPreference, LearningEvent } from "./types";

/**
 * Explainable preference inference.
 *
 * Rules (package 04 red lines):
 * - feedback events ("too hard" etc.) never promote into long-term
 *   preferences; they only feed session-scoped signals.
 * - A preference becomes/stays active only through cross-session repeated
 *   behaviour (save / read_complete / excerpt / note / cite) on the same
 *   concept across at least two distinct sessions.
 * - Every inference carries confidence, evidenceCount, lastConfirmedAt,
 *   expiresAt and the event ids that back it, so the user can inspect and
 *   revoke it.
 */

const BEHAVIOUR_KINDS = new Set(["read_complete", "favorite", "excerpt", "note", "cite"]);

/** Base confidence once cross-session evidence exists. */
const BASE_CONFIDENCE = 0.35;
/** Confidence added per additional distinct session of evidence. */
const CONFIDENCE_PER_SESSION = 0.2;
const MAX_CONFIDENCE = 0.95;
/** Preferences expire 30 days after their last confirming behaviour. */
const PREFERENCE_TTL_DAYS = 30;

type InferenceState = {
  preferences: Map<string, InferredPreference>;
  revoked: Set<string>;
};

const store = globalThis as unknown as { __package04Inference?: InferenceState };

function state(): InferenceState {
  if (!store.__package04Inference) {
    store.__package04Inference = { preferences: new Map(), revoked: new Set() };
  }
  return store.__package04Inference;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function preferenceKey(ownerId: string, conceptId: string): string {
  return `${ownerId}::${conceptId}`;
}

function expiresAfter(iso: string): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + PREFERENCE_TTL_DAYS);
  return date.toISOString();
}

export function recomputeInferredPreferences(ownerId: string): InferredPreference[] {
  const events = listLearningEvents({ ownerId });
  const byConcept = new Map<string, LearningEvent[]>();
  for (const event of events) {
    if (event.kind !== "feedback" && BEHAVIOUR_KINDS.has(event.kind) && event.conceptId) {
      const list = byConcept.get(event.conceptId) ?? [];
      list.push(event);
      byConcept.set(event.conceptId, list);
    }
  }

  const s = state();
  const fresh: InferredPreference[] = [];
  for (const [conceptId, conceptEvents] of byConcept) {
    const key = preferenceKey(ownerId, conceptId);
    // Preserve revocation decisions across recomputes until the user
    // explicitly confirms the preference again via new behaviour + confirm.
    if (s.revoked.has(key)) continue;

    const sessions = new Set(conceptEvents.map((event) => event.sessionId ?? ""));
    const distinctSessions = sessions.size;
    // Single-session behaviour (or a single feedback) must not generalize.
    if (distinctSessions < 2) continue;

    const lastEvent = conceptEvents.reduce((latest, event) => (event.at > latest.at ? event : latest));
    const confidence = Math.min(MAX_CONFIDENCE, BASE_CONFIDENCE + (distinctSessions - 2) * CONFIDENCE_PER_SESSION);
    fresh.push({
      id: `pref-${key}`,
      ownerId,
      conceptId,
      confidence,
      evidenceCount: conceptEvents.length,
      lastConfirmedAt: lastEvent.at,
      expiresAt: expiresAfter(lastEvent.at),
      status: "active",
      evidenceEventIds: conceptEvents.map((event) => event.id),
    });
  }

  // Replace stored preferences for this owner with the fresh computation,
  // keeping any pre-existing revocations (handled above via s.revoked).
  for (const [key, preference] of s.preferences) {
    if (preference.ownerId === ownerId) s.preferences.delete(key);
  }
  for (const preference of fresh) {
    s.preferences.set(preferenceKey(ownerId, preference.conceptId), preference);
  }
  return fresh;
}

/** Active, non-expired, non-revoked preferences for one owner. */
export function listInferredPreferences(ownerId: string): InferredPreference[] {
  const now = new Date().toISOString();
  recomputeInferredPreferences(ownerId);
  const s = state();
  const result: InferredPreference[] = [];
  for (const preference of s.preferences.values()) {
    if (preference.ownerId !== ownerId) continue;
    if (preference.status !== "active") continue;
    if (preference.expiresAt < now) continue;
    result.push(clone(preference));
  }
  return result;
}

export function findInferredPreference(
  ownerId: string,
  preferenceId: string,
): InferredPreference | undefined {
  const s = state();
  for (const preference of s.preferences.values()) {
    if (preference.ownerId === ownerId && preference.id === preferenceId) return clone(preference);
  }
  return undefined;
}

/** Revoke one inference. It disappears from listings and never comes back on its own. */
export function revokeInferredPreference(ownerId: string, preferenceId: string): boolean {
  recomputeInferredPreferences(ownerId);
  const s = state();
  for (const [key, preference] of s.preferences) {
    if (preference.ownerId === ownerId && preference.id === preferenceId) {
      preference.status = "revoked";
      s.revoked.add(key);
      return true;
    }
  }
  return false;
}

/** Forget every inference tied to a concept. */
export function forgetInferredPreferencesByConcept(ownerId: string, conceptId: string): number {
  recomputeInferredPreferences(ownerId);
  const s = state();
  let count = 0;
  for (const [key, preference] of s.preferences) {
    if (preference.ownerId === ownerId && preference.conceptId === conceptId) {
      preference.status = "revoked";
      s.revoked.add(key);
      count += 1;
    }
  }
  // Remember the revocation even when nothing was computed yet, so a later
  // recompute cannot resurrect it.
  s.revoked.add(preferenceKey(ownerId, conceptId));
  return count;
}

export function resetInferenceForTests(): void {
  store.__package04Inference = { preferences: new Map(), revoked: new Set() };
}
