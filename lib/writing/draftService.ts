import type { CurrentPrincipal } from "@/lib/auth/principal";
import {
  requireWritingPorts,
  WritingPortsUnavailableError,
  writingPortsAreInstalled,
} from "@/lib/writing/ports";
import {
  listVerifiedCandidates,
  persistCandidate,
  persistStage,
  resumeWriting,
} from "@/lib/writing/repository";
import type {
  DraftResult,
  EvidenceItem,
  ResearchSessionReadPort,
  WritingCandidateDto,
  WritingCheckpoint,
  WritingStage,
} from "@/lib/writing/types";

export { WritingPortsUnavailableError as WritingDependencyUnavailableError };

export class WritingError extends Error {
  constructor(public code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "WritingError";
  }
}

export function writingPortsAreConfigured(): boolean {
  return writingPortsAreInstalled();
}

export async function requireOwnedResearchSession(
  principal: CurrentPrincipal,
  sessionId: string,
): Promise<ResearchSessionReadPort> {
  const session = await requireWritingPorts().session({ principal, sessionId });
  if (!session) throw new WritingError("NOT_FOUND", "Research session was not found");
  if (session.ownerId !== principal.id) {
    throw new WritingError("FORBIDDEN", "Research session is not available");
  }
  return session;
}

function factualSentence(excerpt: string, id: string) {
  const sentences = excerpt.trim().replace(/\s+/g, " ")
    .match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g) ?? [];
  return sentences.map((value) => {
    const sentence = value.trim();
    const punctuated = /[.!?。！？]$/.test(sentence) ? sentence : `${sentence}.`;
    return `${punctuated} [${id}]`;
  }).join(" ");
}

function focusScore(item: EvidenceItem, terms: string[]): number {
  const searchable = `${item.title} ${item.excerpt}`.toLocaleLowerCase();
  return terms.reduce((score, term) => score + Number(searchable.includes(term)), 0);
}

async function loadCompleteSessionEvidence(
  principal: CurrentPrincipal,
  sessionId: string,
  evidenceIds: string[],
): Promise<EvidenceItem[]> {
  const active = requireWritingPorts();
  const loaded: Array<EvidenceItem | null> = [];
  for (let offset = 0; offset < evidenceIds.length; offset += 50) {
    loaded.push(...await Promise.all(evidenceIds.slice(offset, offset + 50).map((evidenceId) => active.evidence({
      principal,
      sessionId,
      evidenceId,
    }))));
  }
  const missing = evidenceIds.filter((evidenceId, index) => loaded[index]?.id !== evidenceId);
  if (missing.length) {
    throw new WritingError("BAD_REQUEST", `Session evidence is missing: ${missing.join(", ")}`);
  }
  return loaded as EvidenceItem[];
}

export async function discoverWritingEvidence(input: {
  principal: CurrentPrincipal;
  sessionId: string;
  researchQuestion: string;
}): Promise<WritingCandidateDto[]> {
  await requireOwnedResearchSession(input.principal, input.sessionId);
  const discovered = await requireWritingPorts().discover(input);
  return Promise.all(discovered.map((item) => persistCandidate(input.principal.id, input.sessionId, {
    ...item,
    verificationStatus: "needs_review",
    userConfirmedAt: undefined,
  })));
}

async function advanceToDraft(
  principal: CurrentPrincipal,
  sessionId: string,
  evidenceIds: string[],
  focus: string,
  markdown: string,
): Promise<WritingCheckpoint> {
  const stages: Array<{ stage: WritingStage; content: string }> = [
    { stage: "evidence", content: JSON.stringify(evidenceIds) },
    { stage: "verified_sources", content: JSON.stringify(evidenceIds) },
    { stage: "outline", content: `## ${focus}` },
    { stage: "draft", content: markdown },
  ];
  let checkpoint = await resumeWriting(principal.id, sessionId);
  const completedIndex = checkpoint ? stages.findIndex(({ stage }) => stage === checkpoint?.stage) : -1;
  if (checkpoint && completedIndex === -1) return checkpoint;
  for (const item of stages.slice(completedIndex + 1)) {
    checkpoint = await persistStage(principal.id, sessionId, item.stage, item.content);
  }
  if (!checkpoint) throw new Error("Draft checkpoint was not persisted");
  return checkpoint;
}

export async function generateEvidenceDraft(input: {
  principal: CurrentPrincipal;
  sessionId: string;
  focus: string;
  evidenceIds: string[];
}): Promise<DraftResult> {
  if (input.evidenceIds.length < 3) {
    throw new WritingError("BAD_REQUEST", "At least three verified evidence items are required");
  }
  const session = await requireOwnedResearchSession(input.principal, input.sessionId);
  if (new Set(input.evidenceIds).size !== input.evidenceIds.length
      || input.evidenceIds.some((id) => !session.evidenceIds.includes(id))) {
    throw new WritingError("BAD_REQUEST", "Selected evidence must belong to this research session");
  }

  const completeSessionEvidence = await loadCompleteSessionEvidence(
    input.principal,
    input.sessionId,
    session.evidenceIds,
  );
  const byId = new Map(completeSessionEvidence.map((item) => [item.id, item]));
  if (input.evidenceIds.some((id) => {
    const item = byId.get(id);
    return !item || item.verificationStatus !== "verified" || !item.userConfirmedAt;
  })) {
    throw new WritingError("BAD_REQUEST", "Selected evidence must be verified and user confirmed");
  }

  const persisted = await listVerifiedCandidates(input.principal.id, input.sessionId);
  const allVerified = [...completeSessionEvidence.filter(
    (item) => item.verificationStatus === "verified" && Boolean(item.userConfirmedAt),
  ), ...persisted]
    .filter((item, index, all) => all.findIndex(({ id }) => id === item.id) === index);
  if (allVerified.length < 3) {
    throw new WritingError("BAD_REQUEST", "At least three verified and user-confirmed evidence items are required");
  }
  const focusTerms = input.focus.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const verified = allVerified.map((item, index) => ({ item, index }))
    .sort((left, right) => focusScore(right.item, focusTerms) - focusScore(left.item, focusTerms) || left.index - right.index)
    .slice(0, 12)
    .map(({ item }) => item);
  const markdown = `## ${input.focus}\n\n${verified.map((item) => factualSentence(item.excerpt, item.id)).join(" ")}`;
  const checkpoint = await advanceToDraft(
    input.principal,
    input.sessionId,
    verified.map(({ id }) => id),
    input.focus,
    markdown,
  );
  return {
    markdown,
    citations: verified.map((item) => ({ evidenceId: item.id, marker: `[${item.id}]` })),
    source: "deterministic",
    checkpointId: checkpoint.id,
  };
}
