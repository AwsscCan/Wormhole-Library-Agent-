CREATE TABLE "KnowledgeAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "retention" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "storagePath" TEXT NOT NULL,
    "extractionStatus" TEXT NOT NULL DEFAULT 'stored',
    "extractedText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "KnowledgeAsset_ownerId_createdAt_idx" ON "KnowledgeAsset"("ownerId", "createdAt");
CREATE INDEX "KnowledgeAsset_ownerId_expiresAt_idx" ON "KnowledgeAsset"("ownerId", "expiresAt");
