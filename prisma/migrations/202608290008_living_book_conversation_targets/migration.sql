ALTER TABLE "LivingBookConversation" ADD COLUMN "targetOwnerId" TEXT;
CREATE INDEX "LivingBookConversation_targetOwnerId_status_updatedAt_idx" ON "LivingBookConversation"("targetOwnerId", "status", "updatedAt");
