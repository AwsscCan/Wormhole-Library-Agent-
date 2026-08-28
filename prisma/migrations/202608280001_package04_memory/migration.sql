-- Package 04 私有记忆持久化（快照表）。
-- 与 schema.prisma 解耦，用 raw SQL 建表（沿用 ResearchSession 的做法）。

CREATE TABLE "MemorySnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "snapshotJson" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
