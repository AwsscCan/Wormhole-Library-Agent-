-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "wireApi" TEXT NOT NULL,
    "encryptedApiKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ModelPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" REAL NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelPreset_ownerId_providerId_fkey" FOREIGN KEY ("ownerId", "providerId") REFERENCES "ProviderConfig" ("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WritingCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WritingCheckpoint_ownerId_sessionId_artifactId_fkey" FOREIGN KEY ("ownerId", "sessionId", "artifactId") REFERENCES "WritingArtifact" ("ownerId", "sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WritingArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WritingEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalEvidenceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "provenanceJson" TEXT NOT NULL,
    "url" TEXT,
    "verificationStatus" TEXT NOT NULL,
    "userConfirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProviderConnectionRateLimit" (
    "ownerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "windowStartedAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL,

    PRIMARY KEY ("ownerId", "providerId"),
    CONSTRAINT "ProviderConnectionRateLimit_ownerId_providerId_fkey" FOREIGN KEY ("ownerId", "providerId") REFERENCES "ProviderConfig" ("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProviderConfig_ownerId_updatedAt_idx" ON "ProviderConfig"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_ownerId_id_key" ON "ProviderConfig"("ownerId", "id");

-- CreateIndex
CREATE INDEX "ModelPreset_ownerId_providerId_idx" ON "ModelPreset"("ownerId", "providerId");

-- CreateIndex
CREATE INDEX "WritingCheckpoint_ownerId_sessionId_createdAt_idx" ON "WritingCheckpoint"("ownerId", "sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WritingCheckpoint_ownerId_sessionId_stage_key" ON "WritingCheckpoint"("ownerId", "sessionId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "WritingCheckpoint_ownerId_sessionId_artifactId_key" ON "WritingCheckpoint"("ownerId", "sessionId", "artifactId");

-- CreateIndex
CREATE INDEX "WritingArtifact_ownerId_sessionId_createdAt_idx" ON "WritingArtifact"("ownerId", "sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WritingArtifact_ownerId_sessionId_id_key" ON "WritingArtifact"("ownerId", "sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WritingArtifact_ownerId_sessionId_stage_key" ON "WritingArtifact"("ownerId", "sessionId", "stage");

-- CreateIndex
CREATE INDEX "WritingEvidence_ownerId_sessionId_verificationStatus_idx" ON "WritingEvidence"("ownerId", "sessionId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "WritingEvidence_ownerId_sessionId_externalEvidenceId_key" ON "WritingEvidence"("ownerId", "sessionId", "externalEvidenceId");
