import { randomUUID } from "node:crypto";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import type { EvidenceItem, DraftResult, WritingCheckpoint, WritingPorts } from "@/lib/writing/types";

export class WritingError extends Error { constructor(public code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN", message: string) { super(message); } }

let testPorts: Partial<WritingPorts> | undefined;
export function configureWritingPortsForTest(ports: Partial<WritingPorts>) { testPorts = ports; }
export function resetWritingPortsForTest() { testPorts = undefined; }

const defaultPorts: WritingPorts = {
  async session() { return null; },
  async evidence() { return null; },
};
function ports(): WritingPorts { return { ...defaultPorts, ...testPorts }; }

function factualSentence(excerpt: string, id: string) {
  return excerpt.trim().replace(/\s+/g, " ").split(/(?<=[.!?。！？])\s+/).filter(Boolean).map((sentence) => `${sentence.replace(/[.!?。！？]$/, "")}. [${id}]`).join(" ");
}

export async function discoverWritingEvidence(input: { principal: CurrentPrincipal; sessionId: string; researchQuestion: string }): Promise<EvidenceItem[]> {
  return (await ports().discover?.(input) ?? []).map((evidence) => ({ ...evidence, verificationStatus: "needs_review", userConfirmedAt: undefined }));
}

export async function generateEvidenceDraft(input: { principal: CurrentPrincipal; sessionId: string; focus: string; evidenceIds: string[] }): Promise<DraftResult> {
  if (input.evidenceIds.length < 3) throw new WritingError("BAD_REQUEST", "At least three verified evidence items are required");
  const active = ports();
  const session = await active.session({ principal: input.principal, sessionId: input.sessionId });
  if (!session) throw new WritingError("NOT_FOUND", "Research session was not found");
  if (session.ownerId !== input.principal.id) throw new WritingError("FORBIDDEN", "Research session is not available");
  if (new Set(input.evidenceIds).size !== input.evidenceIds.length || input.evidenceIds.some((id) => !session.evidenceIds.includes(id))) {
    throw new WritingError("BAD_REQUEST", "Selected evidence must belong to this research session");
  }
  // A session may hold unlimited references. Rank its verified, caller-selected evidence
  // for the requested focus, then send only the bounded section context onward.
  const all = await Promise.all(input.evidenceIds.map((id) => active.evidence(id)));
  const focusTerms = input.focus.toLowerCase().split(/\W+/).filter(Boolean);
  const evidence = all.filter((item): item is EvidenceItem => Boolean(item)).sort((a, b) => {
    const score = (item: EvidenceItem) => focusTerms.reduce((n, term) => n + Number(`${item.title} ${item.excerpt}`.toLowerCase().includes(term)), 0);
    return score(b) - score(a);
  }).slice(0, 12);
  if (evidence.some((item) => !item || item.verificationStatus !== "verified" || !item.userConfirmedAt)) {
    throw new WritingError("BAD_REQUEST", "Selected evidence must be verified and user confirmed");
  }
  const verified = evidence as EvidenceItem[];
  const checkpoint: WritingCheckpoint = { id: randomUUID(), ownerId: input.principal.id, sessionId: input.sessionId, stage: "draft", createdAt: new Date().toISOString() };
  await active.checkpoint?.(checkpoint);
  return {
    markdown: `## ${input.focus}\n\n${verified.map((item) => factualSentence(item.excerpt, item.id)).join(" ")}`,
    citations: verified.map((item) => ({ evidenceId: item.id, marker: `[${item.id}]` })),
    source: "deterministic",
    checkpointId: checkpoint.id,
  };
}
