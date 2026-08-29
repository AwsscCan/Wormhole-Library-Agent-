import { principalOwnerKey, requireCurrentPrincipal } from "../principal";
import { appendLearningEvent, listLearningEvents } from "./ledger";
import {
  addMemorySnippet,
  deleteMemorySnippet as deleteMemorySnippetInMemory,
  forgetSession as forgetSessionInMemory,
} from "./indexStore";
import {
  forgetInferredPreferencesByConcept as forgetInferredPreferencesByConceptInMemory,
  revokeInferredPreference as revokeInferredPreferenceInMemory,
} from "./inference";
import { persistMemoryState, restoreMemoryState, snapshotMemoryState } from "./persistence";
import type { LearningEvent, LearningEventKind } from "./types";
import type { SourceProvenance } from "../types";

/**
 * Facade for package 04 consumers.
 *
 * recordLearningEvent is the single write path: it appends to the immutable
 * ledger and (for note/excerpt kinds) adds the corresponding private snippet
 * to the retrieval index. Feedback events never touch the index.
 *
 * 写入口（record / delete / forget / revoke）在成功变更后统一持久化，形成
 * 「写后持久化、启动恢复、恢复后继续写」的受控生命周期。
 */

export type RecordEventInput = {
  ownerId: string;
  sessionId?: string;
  kind: LearningEventKind;
  conceptId?: string;
  resourceId?: string;
  query?: string;
  text?: string;
  rating?: LearningEvent["rating"];
  /** Read-only source provenance from package 02. */
  provenance?: SourceProvenance;
  at?: string;
};

const mutationState = globalThis as unknown as { __package04MutationQueue?: Promise<void> };

function serializeMemoryMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = mutationState.__package04MutationQueue ?? Promise.resolve();
  const run = previous.then(operation, operation);
  mutationState.__package04MutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

function mutateAndPersist<T>(operation: () => Promise<{ result: T; changed: boolean }>): Promise<T> {
  return serializeMemoryMutation(async () => {
    const before = snapshotMemoryState();
    try {
      const { result, changed } = await operation();
      if (changed) await persistMemoryState();
      return result;
    } catch (error) {
      await restoreMemoryState(before);
      throw error;
    }
  });
}

export function recordLearningEvent(input: RecordEventInput): Promise<LearningEvent> {
  return mutateAndPersist(async () => {
    const event = appendLearningEvent(input);
    if ((input.kind === "note" || input.kind === "excerpt") && input.text) {
      await addMemorySnippet({
        ownerId: input.ownerId,
        sessionId: input.sessionId ?? "unscoped",
        kind: input.kind,
        text: input.text,
        sourceId: event.id,
        conceptId: input.conceptId,
        provenance: input.provenance,
        createdAt: event.at,
      });
    }
    return { result: event, changed: true };
  });
}

/** 删除 snippet 并持久化（删除后内容不可再召回）。 */
export function deleteMemorySnippet(ownerId: string, snippetId: string): Promise<boolean> {
  return mutateAndPersist(async () => {
    const result = deleteMemorySnippetInMemory(ownerId, snippetId);
    return { result, changed: result };
  });
}

/** 遗忘整个 session 的私有内容并持久化。 */
export function forgetSession(ownerId: string, sessionId: string): Promise<number> {
  return mutateAndPersist(async () => {
    const snapshot = snapshotMemoryState();
    const droppedSnippets = forgetSessionInMemory(ownerId, sessionId);
    const events = snapshot.events.filter((event) => !(event.ownerId === ownerId && event.sessionId === sessionId));
    const removedEvents = snapshot.events.length - events.length;
    const preferences = snapshot.preferences.filter((preference) => preference.ownerId !== ownerId);
    if (removedEvents || preferences.length !== snapshot.preferences.length) {
      const current = snapshotMemoryState();
      await restoreMemoryState({ ...current, events, preferences });
    }
    const dropped = droppedSnippets + removedEvents;
    return { result: dropped, changed: dropped > 0 };
  });
}

/** 撤销一条推断偏好并持久化（撤销决策跨重启保留）。 */
export function revokeInferredPreference(ownerId: string, preferenceId: string): Promise<boolean> {
  return mutateAndPersist(async () => {
    const result = revokeInferredPreferenceInMemory(ownerId, preferenceId);
    return { result, changed: result };
  });
}

/** 遗忘某概念的全部推断偏好并持久化。 */
export function forgetInferredPreferencesByConcept(ownerId: string, conceptId: string): Promise<number> {
  return mutateAndPersist(async () => {
    const count = forgetInferredPreferencesByConceptInMemory(ownerId, conceptId);
    return { result: count, changed: count > 0 };
  });
}

/** Explicit user erasure: remove one owner from every retrievable and auditable P04 memory surface. */
export function forgetOwnerMemory(ownerId: string): Promise<void> {
  return mutateAndPersist(async () => {
    const snapshot = snapshotMemoryState();
    const next = {
      events: snapshot.events.filter((event) => event.ownerId !== ownerId),
      snippets: snapshot.snippets.filter((snippet) => snippet.ownerId !== ownerId),
      preferences: snapshot.preferences.filter((preference) => preference.ownerId !== ownerId),
      revoked: snapshot.revoked.filter((key) => !key.startsWith(`${ownerId}::`)),
    };
    const changed = next.events.length !== snapshot.events.length
      || next.snippets.length !== snapshot.snippets.length
      || next.preferences.length !== snapshot.preferences.length
      || next.revoked.length !== snapshot.revoked.length;
    if (changed) await restoreMemoryState(next);
    return { result: undefined, changed };
  });
}

/**
 * P01 授权的写入口：owner 从 P01 server principal 推导（绝不信调用方给的 ownerId），
 * 同时把 P02 provenance 与 P03 sessionId 作为只读输入写入。
 */
export async function recordLearningEventForCurrentPrincipal(
  request: Request,
  input: Omit<RecordEventInput, "ownerId">,
): Promise<LearningEvent> {
  const principal = await requireCurrentPrincipal(request);
  const ownerId = principalOwnerKey(principal);
  return recordLearningEvent({ ...input, ownerId });
}

export { listLearningEvents };
export { buildHybridMemoryInsights } from "./insights";
export type { HybridMemoryInsights } from "./insights";

export {
  appendLearningEvent,
  findLearningEvent,
  resetLearningLedgerForTests,
} from "./ledger";
export {
  addMemorySnippet,
  countMemorySnippets,
  getMemorySnippet,
  resetMemoryIndexForTests,
  searchPrivateMemory,
  setSemanticEmbedderForTests,
  resetSemanticEmbedderForTests,
  getSemanticEmbedderStatus,
} from "./indexStore";
export {
  findInferredPreference,
  listInferredPreferences,
  recomputeInferredPreferences,
  resetInferenceForTests,
} from "./inference";
export { answerFromSelectedMaterial, makeReviewCards } from "./qa";
export {
  getMemoryPersistenceStore,
  InMemoryMemoryPersistenceStore,
  initMemoryStore,
  loadMemoryState,
  persistMemoryState,
  restoreMemoryState,
  setMemoryPersistenceStoreForTests,
  snapshotMemoryState,
  SqliteMemoryPersistenceStore,
} from "./persistence";
export type { MemoryPersistenceStore, MemorySnapshot } from "./persistence";
export {
  bindMemoryReadPort,
  clearMemoryReadPortForTests,
  defaultMemoryReadPort,
  getMemoryReadPort,
  installMemoryReadPortForTests,
} from "./port";
export type {
  InferredPreference,
  InferredPreferenceStatus,
  LearningEvent,
  LearningEventKind,
  MemoryReadPort,
  MemorySnippet,
  MemorySnippetKind,
  MemorySnippetMatch,
  ProfileAnswer,
  ProfileAnswerCitation,
  ProfileAnswerStatus,
  ReviewCard,
  WorkbenchInferredPreference,
  WorkbenchMemorySnippet,
} from "./types";
export {
  cosineSimilarity,
  createSemanticEmbedder,
  hashedCharNgramEmbedding,
  ollamaEmbedding,
} from "./embedding";
export type { Embedding, EmbedFn, SemanticEmbedder } from "./embedding";
