import { appendLearningEvent, listLearningEvents } from "./ledger";
import { addMemorySnippet } from "./indexStore";
import type { LearningEvent, LearningEventKind } from "./types";

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
      createdAt: event.at,
    });
  }
  return event;
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
} from "./types";
