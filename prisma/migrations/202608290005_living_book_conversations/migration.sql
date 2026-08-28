CREATE TABLE "LivingBookConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterOwnerId" TEXT NOT NULL,
    "livingBookId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "LivingBookMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LivingBookMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "LivingBookConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LivingBookSharedResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sharedByRole" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LivingBookSharedResource_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "LivingBookConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LivingBookAssetGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "assetReference" TEXT NOT NULL,
    "grantedByRole" TEXT NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LivingBookAssetGrant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "LivingBookConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LivingBookConversation_requesterOwnerId_updatedAt_idx" ON "LivingBookConversation"("requesterOwnerId", "updatedAt");
CREATE INDEX "LivingBookConversation_livingBookId_status_idx" ON "LivingBookConversation"("livingBookId", "status");
CREATE INDEX "LivingBookMessage_conversationId_createdAt_idx" ON "LivingBookMessage"("conversationId", "createdAt");
CREATE INDEX "LivingBookSharedResource_conversationId_createdAt_idx" ON "LivingBookSharedResource"("conversationId", "createdAt");
CREATE UNIQUE INDEX "LivingBookAssetGrant_conversationId_assetReference_key" ON "LivingBookAssetGrant"("conversationId", "assetReference");
CREATE INDEX "LivingBookAssetGrant_conversationId_revokedAt_idx" ON "LivingBookAssetGrant"("conversationId", "revokedAt");
