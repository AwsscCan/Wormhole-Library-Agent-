/**
 * Source Federation types (v3.2 package 02)
 */

export type SourceKind =
  | "openalex"
  | "openlibrary"
  | "seed"
  | "user";

export type FederationFailure =
  | { kind: "unreachable"; source: SourceKind; message: string }
  | { kind: "rate_limited"; source: SourceKind; retryAfterMs?: number }
  | { kind: "parse_error"; source: SourceKind; body: string }
  | { kind: "empty"; source: SourceKind; query: string }
  | { kind: "circuit_open"; source: SourceKind; cooldownUntil: number };

export interface SourceRef {
  kind: SourceKind;
  label: string;
  sourceId: string;
  retrievedAt: number;
}

export interface EvidenceItem {
  id: string;
  title: string;
  authors: readonly string[];
  year: number | null;
  excerpt?: string;
  sources: readonly SourceRef[];
  retrievedAt: number;
  doi?: string;
  isbn?: string;
  url?: string;
}

export type SourceOutcome = {
  kind: SourceKind;
  status: "success" | "empty" | "failed" | "disabled";
};

export interface FederationResult {
  items: readonly EvidenceItem[];
  failures: readonly FederationFailure[];
  degraded: boolean;
  sourceOutcomes?: readonly SourceOutcome[];
}

export interface FederatedSource {
  kind: SourceKind;
  label: string;
  lastSuccessAt?: number;
}

export type AdapterResponse =
  | { ok: true; candidates: readonly import("./dedupe").DedupeCandidate[] }
  | { ok: false; failure: FederationFailure };
