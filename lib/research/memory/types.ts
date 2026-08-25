import type { CurrentPrincipal } from "../types";

/**
 * V3.3 Package 04 — Auditable research memory & private RAG.
 *
 * Red lines enforced by this module (see v3.3-package-04-memory-rag.md):
 * - LearningEvent ledger is append-only.
 * - A single feedback (e.g. "too hard") never promotes into a long-term
 *   preference; only cross-session repeated behaviour raises confidence.
 * - Retrieval is hard-scoped to the requesting owner; deleted or forgotten
 *   content is removed from the private index and can never be recalled.
 * - Profile answers may only cite user-selected material; without supporting
 *   evidence the answer must explicitly refuse instead of inventing facts.
 */

export type LearningEventKind =
  | "search"
  | "open"
  | "read_complete"
  | "favorite"
  | "excerpt"
  | "note"
  | "cite"
  | "feedback";

export type LearningEvent = {
  id: string;
  /** principalOwnerKey format: `${mode}:${id}` from package 01. */
  ownerId: string;
  sessionId?: string;
  kind: LearningEventKind;
  /** Concept the behaviour is about; required for preference inference. */
  conceptId?: string;
  resourceId?: string;
  query?: string;
  /** Note/excerpt body; becomes an indexable private snippet. */
  text?: string;
  rating?: "too_easy" | "just_right" | "too_hard" | "useful" | "not_relevant";
  at: string;
};

export type InferredPreferenceStatus = "active" | "revoked";

export type InferredPreference = {
  id: string;
  ownerId: string;
  conceptId: string;
  /** 0..1 — grows only with cross-session evidence. */
  confidence: number;
  /** Number of behaviour events backing the inference. */
  evidenceCount: number;
  lastConfirmedAt: string;
  expiresAt: string;
  status: InferredPreferenceStatus;
  /** Traceability: event ids that back this inference. */
  evidenceEventIds: string[];
};

export type MemorySnippetKind = "note" | "excerpt" | "session_summary";

export type MemorySnippet = {
  id: string;
  ownerId: string;
  sessionId: string;
  createdAt: string;
  /** Id of the learning event or note this snippet came from. */
  sourceId: string;
  conceptId?: string;
  kind: MemorySnippetKind;
  text: string;
};

export type MemorySnippetMatch = MemorySnippet & {
  score: number;
  matchedVia: "lexical" | "semantic" | "both";
};

/** Stable read port consumed by package 05 (workbench). */
export type MemoryReadPort = {
  search(input: {
    ownerId: string;
    sessionId?: string;
    query: string;
    limit: number;
  }): Promise<MemorySnippet[]>;
  listInferredPreferences(input: { ownerId: string }): Promise<InferredPreference[]>;
};

export type ProfileAnswerStatus = "supported" | "unknown";

export type ProfileAnswerCitation = {
  sourceId: string;
  excerpt: string;
  score: number;
};

export type ProfileAnswer = {
  status: ProfileAnswerStatus;
  question: string;
  ownerId: string;
  answer: string;
  citations: ProfileAnswerCitation[];
};

export type ReviewCard = {
  sourceId: string;
  conceptId?: string;
  prompt: string;
  expected: string;
};

export type { CurrentPrincipal };
