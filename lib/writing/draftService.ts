import type { CurrentPrincipal } from "@/lib/auth/principal";
import { generateProviderText } from "@/lib/llm/providerAdapter";
import {
  getOwnedProviderSecret,
  resolveModelForWriting,
} from "@/lib/llm/providerRepository";
import { principalOwnerKey } from "@/lib/research/principal";
import {
  requireWritingPorts,
  WritingPortsUnavailableError,
  writingPortsAreInstalled,
} from "@/lib/writing/ports";
import {
  advanceDraftArtifactStage,
  exportReviewedArtifact,
  persistCandidate,
  confirmCandidate,
  listCandidates,
  resumeDraftArtifact,
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
  if (session.ownerId !== principalOwnerKey(principal)) {
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

function deterministicMarkdown(focus: string, evidence: EvidenceItem[]): string {
  return `## ${focus}\n\n${evidence.map((item) => factualSentence(item.excerpt, item.id)).join(" ")}`;
}

function evidencePrompt(focus: string, evidence: EvidenceItem[]): string {
  return [
    "Write a concise Markdown section grounded only in the allowed evidence JSON below.",
    "Every factual sentence must end with an allowed evidence marker in the exact form [evidence-id].",
    "Never cite, mention, infer from, or invent evidence outside this JSON.",
    `Section focus: ${focus}`,
    `Allowed evidence JSON: ${JSON.stringify(evidence.map(({ id, title, excerpt, provenance }) => ({ id, title, excerpt, provenance })))}`,
  ].join("\n");
}

function evidenceMarkers(markdown: string, allowedIds: Set<string>): string[] | null {
  const markers = [...markdown.matchAll(/\[([^\]\r\n]+)\]/g)].map((match) => match[1]);
  if (!markers.length || markers.some((id) => !allowedIds.has(id))) return null;
  const citedIds = new Set<string>();
  const proseLines = markdown.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!proseLines.length) return null;
  for (const line of proseLines) {
    const fragments = line.match(/[^.!?。！？]+(?:[.!?。！？]+(?:\s*\[[^\]\r\n]+\])?|$)/g) ?? [];
    if (!fragments.length) return null;
    for (const fragment of fragments) {
      const citation = fragment.trim().match(/\[([^\]\r\n]+)\]\s*$/);
      if (!citation || !allowedIds.has(citation[1])) return null;
      citedIds.add(citation[1]);
    }
  }
  return citedIds.size >= 3 ? [...citedIds] : null;
}

async function providerMarkdown(input: {
  principal: CurrentPrincipal;
  focus: string;
  evidence: EvidenceItem[];
  stepPresetId?: string;
  workflowPresetId?: string;
  rolePresetId?: string;
  userDefaultPresetId?: string;
}): Promise<{ markdown: string; citedIds: string[] } | null> {
  try {
    const preset = await resolveModelForWriting(input.principal, input);
    if (!preset) return null;
    const { provider, apiKey } = await getOwnedProviderSecret(input.principal, preset.providerId);
    const markdown = await generateProviderText(provider, apiKey, {
      model: preset.model,
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
    }, evidencePrompt(input.focus, input.evidence));
    const citedIds = evidenceMarkers(markdown, new Set(input.evidence.map(({ id }) => id)));
    return citedIds ? { markdown, citedIds } : null;
  } catch {
    return null;
  }
}

export async function discoverWritingEvidence(input: {
  principal: CurrentPrincipal;
  sessionId: string;
  researchQuestion: string;
}): Promise<WritingCandidateDto[]> {
  await requireOwnedResearchSession(input.principal, input.sessionId);
  const discovered = await requireWritingPorts().discover(input);
  const ownerId = principalOwnerKey(input.principal);
  return Promise.all(discovered.map((item) => persistCandidate(ownerId, input.sessionId, {
    ...item,
    verificationStatus: "needs_review",
    userConfirmedAt: undefined,
  })));
}

export async function listWritingCandidates(input: { principal: CurrentPrincipal; sessionId: string }): Promise<WritingCandidateDto[]> {
  await requireOwnedResearchSession(input.principal, input.sessionId);
  return listCandidates(principalOwnerKey(input.principal), input.sessionId);
}

export async function confirmWritingEvidence(input: {
  principal: CurrentPrincipal;
  sessionId: string;
  evidenceId: string;
}): Promise<WritingCandidateDto | null> {
  await requireOwnedResearchSession(input.principal, input.sessionId);
  const confirmed = await confirmCandidate(
    principalOwnerKey(input.principal),
    input.sessionId,
    input.evidenceId,
  );
  if (!confirmed) return null;
  await requireWritingPorts().addEvidence({
    principal: input.principal,
    sessionId: input.sessionId,
    evidenceId: confirmed.externalEvidenceId,
  });
  return confirmed;
}

export async function resumeEvidenceDraft(input: { principal: CurrentPrincipal; sessionId: string }) {
  await requireOwnedResearchSession(input.principal, input.sessionId);
  const ownerId = principalOwnerKey(input.principal);
  const artifact = await resumeDraftArtifact(ownerId, input.sessionId);
  if (!artifact) return null;
  const candidates = await listCandidates(ownerId, input.sessionId);
  const allowedIds = new Set(candidates.map((candidate) => candidate.externalEvidenceId));
  const evidenceIds = [...new Set(
    [...artifact.markdown.matchAll(/\[([^\]\r\n]+)\]/g)]
      .map((match) => match[1])
      .filter((evidenceId) => allowedIds.has(evidenceId)),
  )];
  return {
    markdown: artifact.markdown,
    citations: evidenceIds.map((evidenceId) => ({ evidenceId, marker: `[${evidenceId}]` })),
    source: "restored" as const,
    checkpointId: artifact.checkpoint.id,
    stage: artifact.checkpoint.stage,
  };
}

async function advanceToDraft(
  principal: CurrentPrincipal,
  sessionId: string,
  evidenceIds: string[],
  focus: string,
  markdown: string,
): Promise<WritingCheckpoint> {
  const ownerId = principalOwnerKey(principal);
  const stages: Array<{ stage: WritingStage; content: string }> = [
    { stage: "evidence", content: JSON.stringify(evidenceIds) },
    { stage: "verified_sources", content: JSON.stringify(evidenceIds) },
    { stage: "outline", content: `## ${focus}` },
    { stage: "draft", content: markdown },
  ];
  let checkpoint = await resumeWriting(ownerId, sessionId);
  const completedIndex = checkpoint ? stages.findIndex(({ stage }) => stage === checkpoint?.stage) : -1;
  if (checkpoint?.stage === "draft" || (checkpoint && completedIndex === -1)) {
    throw new WritingError("BAD_REQUEST", "This research session already has a server-owned draft artifact");
  }
  for (const item of stages.slice(completedIndex + 1)) {
    checkpoint = await persistStage(ownerId, sessionId, item.stage, item.content);
  }
  if (!checkpoint) throw new Error("Draft checkpoint was not persisted");
  return checkpoint;
}

export async function generateEvidenceDraft(input: {
  principal: CurrentPrincipal;
  sessionId: string;
  focus: string;
  evidenceIds: string[];
  stepPresetId?: string;
  workflowPresetId?: string;
  rolePresetId?: string;
  userDefaultPresetId?: string;
}): Promise<DraftResult> {
  if (input.evidenceIds.length < 3) {
    throw new WritingError("BAD_REQUEST", "At least three verified evidence items are required");
  }
  const session = await requireOwnedResearchSession(input.principal, input.sessionId);
  if (new Set(input.evidenceIds).size !== input.evidenceIds.length
      || input.evidenceIds.some((id) => !session.evidenceIds.includes(id))) {
    throw new WritingError("BAD_REQUEST", "Selected evidence must belong to this research session");
  }
  const selectedEvidence = await loadCompleteSessionEvidence(
    input.principal,
    input.sessionId,
    input.evidenceIds,
  );
  if (selectedEvidence.some((item) => item.verificationStatus !== "verified" || !item.userConfirmedAt)) {
    throw new WritingError("BAD_REQUEST", "Selected evidence must be verified and user confirmed");
  }
  const activeCheckpoint = await resumeWriting(principalOwnerKey(input.principal), input.sessionId);
  if (activeCheckpoint && ["draft", "evidence_link", "human_review", "export"].includes(activeCheckpoint.stage)) {
    throw new WritingError("BAD_REQUEST", "This research session already has a server-owned draft artifact");
  }

  const focusTerms = input.focus.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const verified = selectedEvidence.map((item, index) => ({ item, index }))
    .sort((left, right) => focusScore(right.item, focusTerms) - focusScore(left.item, focusTerms) || left.index - right.index)
    .slice(0, 12)
    .map(({ item }) => item);
  const generated = await providerMarkdown({ ...input, evidence: verified });
  const markdown = generated?.markdown ?? deterministicMarkdown(input.focus, verified);
  const checkpoint = await advanceToDraft(
    input.principal,
    input.sessionId,
    verified.map(({ id }) => id),
    input.focus,
    markdown,
  );
  return {
    markdown,
    citations: (generated?.citedIds ?? verified.map(({ id }) => id))
      .map((evidenceId) => ({ evidenceId, marker: `[${evidenceId}]` })),
    source: generated ? "provider" : "deterministic",
    checkpointId: checkpoint.id,
    stage: "draft",
  };
}

export async function advanceDraftReview(input: {
  principal: CurrentPrincipal;
  sessionId: string;
  stage: "evidence_link" | "human_review";
  confirmed?: boolean;
}): Promise<WritingCheckpoint> {
  await requireOwnedResearchSession(input.principal, input.sessionId);
  if (input.stage === "human_review" && input.confirmed !== true) {
    throw new WritingError("BAD_REQUEST", "Human review must be explicitly confirmed");
  }
  return advanceDraftArtifactStage(principalOwnerKey(input.principal), input.sessionId, input.stage);
}

export async function exportEvidenceDraft(input: {
  principal: CurrentPrincipal;
  sessionId: string;
}): Promise<{ markdown: string; checkpoint: WritingCheckpoint }> {
  await requireOwnedResearchSession(input.principal, input.sessionId);
  const artifact = await exportReviewedArtifact(principalOwnerKey(input.principal), input.sessionId);
  if (!artifact) throw new WritingError("BAD_REQUEST", "The latest draft has not completed human review");
  return artifact;
}
