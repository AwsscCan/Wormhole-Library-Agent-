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
  const cleaned = excerpt.trim().replace(/\s+/g, " ");
  return `${cleaned.endsWith(".") ? cleaned.slice(0, -1) : cleaned}. [${id}]`;
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
  // The session itself can be unbounded; a single section has an explicit bounded context.
  const selected = input.evidenceIds.slice(0, 12);
  const evidence = await Promise.all(selected.map((id) => active.evidence(id)));
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
