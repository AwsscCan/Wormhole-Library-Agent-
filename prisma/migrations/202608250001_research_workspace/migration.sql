CREATE TABLE "ResearchSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "researchQuestion" TEXT NOT NULL,
  "writingTopic" TEXT,
  "interactionIdsJson" TEXT NOT NULL DEFAULT '[]',
  "evidenceIdsJson" TEXT NOT NULL DEFAULT '[]',
  "searchesJson" TEXT NOT NULL DEFAULT '[]',
  "wormholesJson" TEXT NOT NULL DEFAULT '[]',
  "personalGraphJson" TEXT NOT NULL,
  "graphVersion" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ResearchSession_ownerId_updatedAt_idx"
ON "ResearchSession"("ownerId", "updatedAt");
