import type { WritingStage } from "@/lib/writing/types";

const next: Record<WritingStage, WritingStage | null> = {
  evidence: "verified_sources", verified_sources: "outline", outline: "draft", draft: "evidence_link", evidence_link: "human_review", human_review: "export", export: null,
};
export class WritingStateError extends Error {}
export function legalNextStage(stage: WritingStage) { return next[stage]; }
export function advanceWritingStage(current: WritingStage, requested: WritingStage) { if (next[current] !== requested) throw new WritingStateError(`Cannot transition ${current} to ${requested}`); return requested; }
