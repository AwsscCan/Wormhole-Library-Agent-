-- Persist the server-owned Markdown needed for review-gated export.
ALTER TABLE "WritingArtifact" ADD COLUMN "content" TEXT NOT NULL DEFAULT '';

-- One immutable draft artifact advances through draft, evidence_link,
-- human_review and export checkpoints; those checkpoints intentionally share it.
DROP INDEX "WritingCheckpoint_ownerId_sessionId_artifactId_key";
