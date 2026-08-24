import { createRequire } from "node:module";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
const temporaryRoot = resolve(process.cwd(), ".tmp");
const freshPath = resolve(temporaryRoot, `writing-migration-fresh-${process.pid}.db`);
const upgradePath = resolve(temporaryRoot, `writing-migration-upgrade-${process.pid}.db`);
const baselineMigration = resolve(process.cwd(), "prisma", "migrations", "202608240001_baseline_auth_notes", "migration.sql");
const task4Migration = resolve(process.cwd(), "prisma", "migrations", "202608240002_provider_writing", "migration.sql");

async function executeMigrations(path: string, migrations: string[]) {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys=ON");
  for (const migration of migrations) database.exec(await readFile(migration, "utf8"));
  database.close();
}

function tableNames(database: InstanceType<typeof DatabaseSync>) {
  return database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    .map((row) => (row as { name: string }).name);
}

function createExistingAuthAndNoteDatabase() {
  const database = new DatabaseSync(upgradePath);
  database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT,
      "email" TEXT NOT NULL,
      "emailVerified" BOOLEAN NOT NULL DEFAULT false,
      "image" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
    CREATE TABLE "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "expiresAt" DATETIME NOT NULL,
      "token" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId" TEXT NOT NULL,
      CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
    CREATE INDEX "Session_userId_idx" ON "Session"("userId");
    CREATE TABLE "Account" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "issuer" TEXT NOT NULL,
      "accountId" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "accessToken" TEXT,
      "refreshToken" TEXT,
      "idToken" TEXT,
      "accessTokenExpiresAt" DATETIME,
      "refreshTokenExpiresAt" DATETIME,
      "scope" TEXT,
      "password" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX "Account_issuer_accountId_key" ON "Account"("issuer", "accountId");
    CREATE INDEX "Account_userId_idx" ON "Account"("userId");
    CREATE TABLE "Note" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "ownerId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "markdown" TEXT NOT NULL,
      "linksJson" TEXT NOT NULL DEFAULT '[]',
      "version" INTEGER NOT NULL DEFAULT 1,
      "deletedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE INDEX "Note_ownerId_deletedAt_updatedAt_idx" ON "Note"("ownerId", "deletedAt", "updatedAt");
    INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('member-a', 'member@example.test', CURRENT_TIMESTAMP);
    INSERT INTO "Session" ("id", "expiresAt", "token", "updatedAt", "userId")
      VALUES ('session-a', '2030-01-01T00:00:00.000Z', 'token-a', CURRENT_TIMESTAMP, 'member-a');
    INSERT INTO "Account" ("id", "issuer", "accountId", "providerId", "userId", "updatedAt")
      VALUES ('account-a', 'wormhole', 'member@example.test', 'credential', 'member-a', CURRENT_TIMESTAMP);
    INSERT INTO "Note" ("id", "ownerId", "title", "markdown", "updatedAt")
      VALUES ('note-a', 'member-a', 'Keep me', 'Existing note', CURRENT_TIMESTAMP);
  `);
  database.close();
}

describe("Task 4 Prisma migration", () => {
  beforeAll(async () => {
    await mkdir(temporaryRoot, { recursive: true });
    await Promise.all([freshPath, upgradePath].flatMap((path) => [path, `${path}-journal`, `${path}-shm`, `${path}-wal`])
      .map((path) => rm(path, { force: true })));
    createExistingAuthAndNoteDatabase();
  });

  afterAll(async () => {
    await Promise.all([freshPath, upgradePath].flatMap((path) => [path, `${path}-journal`, `${path}-shm`, `${path}-wal`])
      .map((path) => rm(path, { force: true })));
  });

  it("deploys the reviewed schema to a fresh SQLite database", async () => {
    await executeMigrations(freshPath, [baselineMigration, task4Migration]);
    const database = new DatabaseSync(freshPath);
    const tables = tableNames(database);
    expect(tables).toEqual(expect.arrayContaining([
      "User",
      "Note",
      "ProviderConfig",
      "ModelPreset",
      "WritingEvidence",
      "WritingArtifact",
      "WritingCheckpoint",
      "ProviderConnectionRateLimit",
    ]));
    const evidenceColumns = database.prepare("PRAGMA table_info('WritingEvidence')").all()
      .map((row) => (row as { name: string }).name);
    expect(evidenceColumns).toEqual(expect.arrayContaining(["id", "externalEvidenceId", "ownerId", "sessionId"]));
    database.close();
  });

  it("upgrades an existing auth and Note database without losing data", async () => {
    await executeMigrations(upgradePath, [task4Migration]);
    const database = new DatabaseSync(upgradePath);
    try {
      expect(database.prepare("SELECT issuer FROM Account WHERE id = 'account-a'").get()).toEqual({ issuer: "wormhole" });
      expect(database.prepare("SELECT markdown FROM Note WHERE id = 'note-a'").get()).toEqual({ markdown: "Existing note" });
      expect(tableNames(database)).toEqual(expect.arrayContaining(["ProviderConfig", "WritingEvidence", "WritingCheckpoint"]));
      const presetForeignKeys = database.prepare("PRAGMA foreign_key_list('ModelPreset')").all() as Array<{ table: string; on_delete: string }>;
      expect(presetForeignKeys).toEqual(expect.arrayContaining([
        expect.objectContaining({ table: "ProviderConfig", on_delete: "CASCADE" }),
      ]));
    } finally {
      database.close();
    }
  });
});
