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
import { persistMemoryState } from "./persistence";
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

export async function recordLearningEvent(input: RecordEventInput): Promise<LearningEvent> {
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
  await persistMemoryState();
  return event;
}

/** 删除 snippet 并持久化（删除后内容不可再召回）。 */
export async function deleteMemorySnippet(ownerId: string, snippetId: string): Promise<boolean> {
  const result = deleteMemorySnippetInMemory(ownerId, snippetId);
  if (result) await persistMemoryState();
  return result;
}

/** 遗忘整个 session 的私有内容并持久化。 */
export async function forgetSession(ownerId: string, sessionId: string): Promise<number> {
  const dropped = forgetSessionInMemory(ownerId, sessionId);
  if (dropped > 0) await persistMemoryState();
  return dropped;
}

/** 撤销一条推断偏好并持久化（撤销决策跨重启保留）。 */
export async function revokeInferredPreference(ownerId: string, preferenceId: string): Promise<boolean> {
  const result = revokeInferredPreferenceInMemory(ownerId, preferenceId);
  if (result) await persistMemoryState();
  return result;
}

/** 遗忘某概念的全部推断偏好并持久化。 */
export async function forgetInferredPreferencesByConcept(ownerId: string, conceptId: string): Promise<number> {
  const count = forgetInferredPreferencesByConceptInMemory(ownerId, conceptId);
  if (count > 0) await persistMemoryState();
  return count;
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
