import { randomUUID } from "node:crypto";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import type { EvidenceItem, DraftResult, WritingCheckpoint, WritingPorts } from "@/lib/writing/types";
import { persistStage } from "@/lib/writing/repository";

export class WritingError extends Error { constructor(public code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN", message: string) { super(message); } }
export class WritingDependencyUnavailableError extends Error { constructor() { super("Writing session and catalog dependencies are not configured"); } }

let testPorts: Partial<WritingPorts> | undefined;
export function configureWritingPortsForTest(ports: Partial<WritingPorts>) { testPorts = ports; }
export function resetWritingPortsForTest() { testPorts = undefined; }

const defaultPorts: WritingPorts = {
  async session() { return null; },
  async evidence() { return null; },
};
function ports(): WritingPorts { return { ...defaultPorts, ...testPorts }; }
export function writingPortsAreConfigured() { return Boolean(testPorts?.session && testPorts?.evidence); }

function factualSentence(excerpt: string, id: string) {
  return excerpt.trim().replace(/\s+/g, " ").split(/(?<=[.!?。！？])\s+/).filter(Boolean).map((sentence) => `${sentence.replace(/[.!?。！？]$/, "")}. [${id}]`).join(" ");
}

export async function discoverWritingEvidence(input: { principal: CurrentPrincipal; sessionId: string; researchQuestion: string }): Promise<EvidenceItem[]> {
  return (await ports().discover?.(input) ?? []).map((evidence) => ({ ...evidence, verificationStatus: "needs_review", userConfirmedAt: undefined }));
}

export async function generateEvidenceDraft(input: { principal: CurrentPrincipal; sessionId: string; focus: string; evidenceIds: string[] }): Promise<DraftResult> {
  if (!writingPortsAreConfigured()) throw new WritingDependencyUnavailableError();
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
  const markdown = `## ${input.focus}\n\n${verified.map((item) => factualSentence(item.excerpt, item.id)).join(" ")}`;
  let checkpoint: WritingCheckpoint = { id: randomUUID(), ownerId: input.principal.id, sessionId: input.sessionId, stage: "draft", createdAt: new Date().toISOString() };
  if (active.checkpoint) await active.checkpoint(checkpoint);
  else if (!testPorts) { let previous: import("@/lib/writing/types").WritingStage | null = null; for (const stage of ["evidence", "verified_sources", "outline", "draft"] as const) { const saved = await persistStage(input.principal.id, input.sessionId, previous, stage, stage === "draft" ? markdown : ""); checkpoint = { id: saved.id, ownerId: saved.ownerId, sessionId: saved.sessionId, stage: saved.stage as import("@/lib/writing/types").WritingStage, artifactId: saved.artifactId ?? undefined, createdAt: saved.createdAt.toISOString() }; previous = stage; } }
  return {
    markdown,
    citations: verified.map((item) => ({ evidenceId: item.id, marker: `[${item.id}]` })),
    source: "deterministic",
    checkpointId: checkpoint.id,
  };
}
