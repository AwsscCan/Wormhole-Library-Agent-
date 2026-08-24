import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";
import type { EvidenceItem, WritingCheckpoint, WritingStage } from "@/lib/writing/types";
import { advanceWritingStage } from "@/lib/writing/stateMachine";

export class WritingDependencyError extends Error { constructor() { super("Writing session and catalog ports are not configured"); } }
export async function persistCandidate(ownerId: string, sessionId: string, item: EvidenceItem) {
  await getPrisma().writingEvidence.upsert({ where: { id: item.id }, create: { id: item.id, ownerId, sessionId, title: item.title, excerpt: item.excerpt, provenanceJson: JSON.stringify(item.provenance), url: item.url, verificationStatus: "needs_review" }, update: { title: item.title, excerpt: item.excerpt, provenanceJson: JSON.stringify(item.provenance), url: item.url, verificationStatus: "needs_review", userConfirmedAt: null } });
}
export async function confirmCandidate(ownerId: string, sessionId: string, evidenceId: string) {
  const record = await getPrisma().writingEvidence.findFirst({ where: { id: evidenceId, ownerId, sessionId, verificationStatus: "needs_review" } }); if (!record) return null;
  return getPrisma().writingEvidence.update({ where: { id: record.id }, data: { verificationStatus: "verified", userConfirmedAt: new Date() } });
}
export async function persistStage(ownerId: string, sessionId: string, previous: WritingStage | null, stage: WritingStage, content: string) {
  if (previous) advanceWritingStage(previous, stage);
  const artifactId = randomUUID(); const contentHash = createHash("sha256").update(content).digest("hex");
  return getPrisma().$transaction(async (tx) => { await tx.writingArtifact.create({ data: { id: artifactId, ownerId, sessionId, stage, contentHash } }); const checkpoint = await tx.writingCheckpoint.create({ data: { id: randomUUID(), ownerId, sessionId, stage, artifactId } }); return checkpoint; });
}
export async function resumeWriting(ownerId: string, sessionId: string): Promise<WritingCheckpoint | null> { const last = await getPrisma().writingCheckpoint.findFirst({ where: { ownerId, sessionId }, orderBy: { createdAt: "desc" } }); return last ? { id: last.id, ownerId: last.ownerId, sessionId: last.sessionId, stage: last.stage as WritingStage, artifactId: last.artifactId ?? undefined, createdAt: last.createdAt.toISOString() } : null; }
export async function consumeConnectionTest(ownerId: string, providerId: string, now = new Date()) {
  const windowMs = 60_000; return getPrisma().$transaction(async (tx) => { const existing = await tx.providerConnectionRateLimit.findUnique({ where: { ownerId_providerId: { ownerId, providerId } } }); if (existing && now.getTime() - existing.windowStartedAt.getTime() < windowMs && existing.attempts >= 1) return false; await tx.providerConnectionRateLimit.upsert({ where: { ownerId_providerId: { ownerId, providerId } }, create: { ownerId, providerId, windowStartedAt: now, attempts: 1 }, update: !existing || now.getTime() - existing.windowStartedAt.getTime() >= windowMs ? { windowStartedAt: now, attempts: 1 } : { attempts: { increment: 1 } } }); return true; }); }
