CREATE TABLE "ExplorationWorkbench" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "stateJson" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ExplorationWorkbench_ownerId_updatedAt_idx"
ON "ExplorationWorkbench"("ownerId", "updatedAt");
