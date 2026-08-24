import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";
import type {
  EvidenceItem,
  WritingCandidateDto,
  WritingCheckpoint,
  WritingStage,
} from "@/lib/writing/types";
import { advanceWritingStage, WritingStateError } from "@/lib/writing/stateMachine";

type StoredProvenance = EvidenceItem["provenance"] & {
  doi?: string;
  authors?: string[];
  titleAuthorMatch?: EvidenceItem["titleAuthorMatch"];
};

function candidateDto(record: {
  id: string;
  externalEvidenceId: string;
  title: string;
  excerpt: string;
  provenanceJson: string;
  url: string | null;
  verificationStatus: string;
  userConfirmedAt: Date | null;
}): WritingCandidateDto {
  const stored = JSON.parse(record.provenanceJson) as StoredProvenance;
  const { doi, authors, titleAuthorMatch, ...provenance } = stored;
  return {
    id: record.id,
    externalEvidenceId: record.externalEvidenceId,
    title: record.title,
    excerpt: record.excerpt,
    provenance,
    url: record.url ?? undefined,
    doi,
    authors,
    titleAuthorMatch,
    verificationStatus: record.verificationStatus as EvidenceItem["verificationStatus"],
    userConfirmedAt: record.userConfirmedAt?.toISOString(),
  };
}

export async function persistCandidate(
  ownerId: string,
  sessionId: string,
  item: EvidenceItem,
): Promise<WritingCandidateDto> {
  const provenance: StoredProvenance = {
    ...item.provenance,
    doi: item.doi,
    authors: item.authors,
    titleAuthorMatch: item.titleAuthorMatch,
  };
  const record = await getPrisma().writingEvidence.upsert({
    where: {
      ownerId_sessionId_externalEvidenceId: {
        ownerId,
        sessionId,
        externalEvidenceId: item.id,
      },
    },
    create: {
      ownerId,
      sessionId,
      externalEvidenceId: item.id,
      title: item.title,
      excerpt: item.excerpt,
      provenanceJson: JSON.stringify(provenance),
      url: item.url,
      verificationStatus: "needs_review",
    },
    update: {
      title: item.title,
      excerpt: item.excerpt,
      provenanceJson: JSON.stringify(provenance),
      url: item.url,
      verificationStatus: "needs_review",
      userConfirmedAt: null,
    },
  });
  return candidateDto(record);
}

export async function confirmCandidate(ownerId: string, sessionId: string, evidenceId: string) {
  const record = await getPrisma().writingEvidence.findFirst({
    where: { id: evidenceId, ownerId, sessionId, verificationStatus: "needs_review" },
  });
  if (!record) return null;
  const proof = JSON.parse(record.provenanceJson) as StoredProvenance;
  const hasSourceProof = proof.retrievedAt && proof.sourceKind;
  const hasMatchProof = proof.titleAuthorMatch === "matched" || proof.titleAuthorMatch === "partial";
  const hasIdentityProof = hasMatchProof && Boolean(proof.authors?.length) && Boolean(proof.doi || record.url);
  if (!hasSourceProof || !hasIdentityProof) return null;
  const confirmed = await getPrisma().writingEvidence.update({
    where: { id: record.id },
    data: { verificationStatus: "verified", userConfirmedAt: new Date() },
  });
  return candidateDto(confirmed);
}

export async function listVerifiedCandidates(ownerId: string, sessionId: string): Promise<WritingCandidateDto[]> {
  const records = await getPrisma().writingEvidence.findMany({
    where: {
      ownerId,
      sessionId,
      verificationStatus: "verified",
      userConfirmedAt: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });
  return records.map(candidateDto);
}

function checkpointDto(checkpoint: {
  id: string;
  ownerId: string;
  sessionId: string;
  stage: string;
  artifactId: string;
  createdAt: Date;
}): WritingCheckpoint {
  return {
    id: checkpoint.id,
    ownerId: checkpoint.ownerId,
    sessionId: checkpoint.sessionId,
    stage: checkpoint.stage as WritingStage,
    artifactId: checkpoint.artifactId,
    createdAt: checkpoint.createdAt.toISOString(),
  };
}

export async function persistStage(
  ownerId: string,
  sessionId: string,
  stage: WritingStage,
  content: string,
): Promise<WritingCheckpoint> {
  return getPrisma().$transaction(async (transaction) => {
    const previous = await transaction.writingCheckpoint.findFirst({
      where: { ownerId, sessionId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!previous) {
      if (stage !== "evidence") throw new WritingStateError(`Cannot begin writing at ${stage}`);
    } else {
      advanceWritingStage(previous.stage as WritingStage, stage);
    }

    const artifactId = randomUUID();
    const contentHash = createHash("sha256").update(content).digest("hex");
    await transaction.writingArtifact.create({
      data: { id: artifactId, ownerId, sessionId, stage, contentHash },
    });
    const checkpoint = await transaction.writingCheckpoint.create({
      data: { id: randomUUID(), ownerId, sessionId, stage, artifactId },
    });
    return checkpointDto(checkpoint);
  });
}

export async function resumeWriting(ownerId: string, sessionId: string): Promise<WritingCheckpoint | null> {
  const last = await getPrisma().writingCheckpoint.findFirst({
    where: { ownerId, sessionId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return last ? checkpointDto(last) : null;
}

export async function consumeConnectionTest(ownerId: string, providerId: string, now = new Date()) {
  const windowMs = 60_000;
  return getPrisma().$transaction(async (transaction) => {
    const existing = await transaction.providerConnectionRateLimit.findUnique({
      where: { ownerId_providerId: { ownerId, providerId } },
    });
    if (existing && now.getTime() - existing.windowStartedAt.getTime() < windowMs && existing.attempts >= 1) {
      return false;
    }
    await transaction.providerConnectionRateLimit.upsert({
      where: { ownerId_providerId: { ownerId, providerId } },
      create: { ownerId, providerId, windowStartedAt: now, attempts: 1 },
      update: !existing || now.getTime() - existing.windowStartedAt.getTime() >= windowMs
        ? { windowStartedAt: now, attempts: 1 }
        : { attempts: { increment: 1 } },
    });
    return true;
  });
}
