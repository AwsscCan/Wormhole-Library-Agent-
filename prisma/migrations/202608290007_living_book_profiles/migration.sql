CREATE TABLE "LivingBookWorkspaceProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "displayMode" TEXT NOT NULL DEFAULT 'anonymous',
    "topicsJson" TEXT NOT NULL DEFAULT '[]',
    "willingTypesJson" TEXT NOT NULL DEFAULT '[]',
    "optIn" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LivingBookWorkspaceProfile_ownerId_optIn_idx" ON "LivingBookWorkspaceProfile"("ownerId", "optIn");
CREATE UNIQUE INDEX "LivingBookWorkspaceProfile_ownerId_key" ON "LivingBookWorkspaceProfile"("ownerId");
