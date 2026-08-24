-- Migration 002 stored only a hash, so its Markdown cannot be reconstructed or
-- safely exported. Invalidate that unrecoverable writing state while retaining
-- the owner's evidence collection; the now-checkpoint-free session can generate
-- a new server-owned draft after this migration.
BEGIN IMMEDIATE;

DELETE FROM "WritingCheckpoint";
DELETE FROM "WritingArtifact";

-- Persist the server-owned Markdown needed for review-gated export. The default
-- exists only because SQLite ALTER TABLE requires one for a NOT NULL column;
-- application writes always supply content and blank content is not reviewable.
ALTER TABLE "WritingArtifact" ADD COLUMN "content" TEXT NOT NULL DEFAULT '';

-- One immutable draft artifact advances through draft, evidence_link,
-- human_review and export checkpoints; those checkpoints intentionally share it.
DROP INDEX "WritingCheckpoint_ownerId_sessionId_artifactId_key";

COMMIT;
