import { principalOwnerKey, requireCurrentPrincipal } from "../principal";
import { appendLearningEvent, listLearningEvents } from "./ledger";
import { addMemorySnippet } from "./indexStore";
import type { LearningEvent, LearningEventKind } from "./types";
import type { SourceProvenance } from "../types";

/**
 * Facade for package 04 consumers.
 *
 * recordLearningEvent is the single write path: it appends to the immutable
 * ledger and (for note/excerpt kinds) adds the corresponding private snippet
 * to the retrieval index. Feedback events never touch the index.
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

export function recordLearningEvent(input: RecordEventInput): LearningEvent {
  const event = appendLearningEvent(input);
  if ((input.kind === "note" || input.kind === "excerpt") && input.text) {
    addMemorySnippet({
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
  return event;
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
  deleteMemorySnippet,
  forgetSession,
  getMemorySnippet,
  resetMemoryIndexForTests,
  searchPrivateMemory,
} from "./indexStore";
export {
  findInferredPreference,
  forgetInferredPreferencesByConcept,
  listInferredPreferences,
  recomputeInferredPreferences,
  resetInferenceForTests,
  revokeInferredPreference,
} from "./inference";
export { answerFromSelectedMaterial, makeReviewCards } from "./qa";
export {
  getMemoryPersistenceStore,
  InMemoryMemoryPersistenceStore,
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
export { cosineSimilarity, hashedCharNgramEmbedding, ollamaEmbedding } from "./embedding";
export type { Embedding, EmbedFn } from "./embedding";
