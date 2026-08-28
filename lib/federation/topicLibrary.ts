import { federateSearch, type FederateOptions } from "./federation";
import { getFailureMessage } from "./failures";
import type { EvidenceItem, FederationFailure, SourceKind } from "./types";

export interface SourceSummary {
  kind: SourceKind;
  label: string;
  ok: boolean;
}

export interface LibraryTopicResponse {
  topic: string;
  items: readonly EvidenceItem[];
  failures: readonly FederationFailure[];
  failureMessages: readonly string[];
  degraded: boolean;
  sources: readonly SourceSummary[];
}

export interface TopicLibraryInput { topic: string; limit?: number; }

const SOURCE_LABELS: Record<SourceKind, string> = {
  openalex: "OpenAlex",
  openlibrary: "Open Library",
  seed: "本地种子",
  user: "用户",
};

function boolEnv(name: string): boolean {
  return process.env[name] === "1";
}

export async function getTopicLibrary(input: TopicLibraryInput, options: FederateOptions = {}): Promise<LibraryTopicResponse> {
  const result = await federateSearch({ topic: input.topic, limit: input.limit }, {
    ...options,
    includeOpenAlex: options.includeOpenAlex ?? !boolEnv("OPENALEX_DISABLED"),
    includeOpenLibrary: options.includeOpenLibrary ?? !boolEnv("OPENLIBRARY_DISABLED"),
  });
  const failedSources = new Set(result.failures.map((f) => f.source));
  const attempted = new Set<SourceKind>();
  for (const item of result.items) for (const s of item.sources) attempted.add(s.kind);
  for (const failure of result.failures) attempted.add(failure.source);
  return {
    topic: input.topic,
    items: result.items,
    failures: result.failures,
    failureMessages: result.failures.map(getFailureMessage),
    degraded: result.degraded,
    sources: Array.from(attempted).map((kind) => ({ kind, label: SOURCE_LABELS[kind], ok: !failedSources.has(kind) })),
  };
}
