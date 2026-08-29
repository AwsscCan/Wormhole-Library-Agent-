CREATE TABLE "CatalogSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'personal',
    "protocol" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "mappingJson" TEXT NOT NULL DEFAULT '{}',
    "encryptedCredentials" TEXT,
    "status" TEXT NOT NULL DEFAULT 'configured',
    "lastCheckedAt" DATETIME,
    "lastMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "CatalogSource_ownerId_updatedAt_idx" ON "CatalogSource"("ownerId", "updatedAt");
