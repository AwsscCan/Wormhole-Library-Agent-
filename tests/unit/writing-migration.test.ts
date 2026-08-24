import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
const temporaryRoot = resolve(process.cwd(), ".tmp");
const freshPath = resolve(temporaryRoot, `writing-migration-fresh-${process.pid}.db`);
const upgradePath = resolve(temporaryRoot, `writing-migration-upgrade-${process.pid}.db`);
const cliFreshPath = resolve(temporaryRoot, `writing-migrate-cli-fresh-${process.pid}.db`);
const cliExistingPath = resolve(temporaryRoot, `writing-migrate-cli-existing-${process.pid}.db`);
const baselineMigration = resolve(process.cwd(), "prisma", "migrations", "202608240001_baseline_auth_notes", "migration.sql");
const task4Migration = resolve(process.cwd(), "prisma", "migrations", "202608240002_provider_writing", "migration.sql");
const reviewExportMigration = resolve(process.cwd(), "prisma", "migrations", "202608240003_reviewed_artifact_export", "migration.sql");
const prismaCli = resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");
const executeFile = promisify(execFile);

function databaseUrl(path: string) {
  return `file:./../.tmp/${path.split(/[\\/]/).at(-1)}`;
}

async function runPrisma(path: string, args: string[]) {
  return executeFile(process.execPath, [prismaCli, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl(path), PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    windowsHide: true,
  });
}

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
    await Promise.all([freshPath, upgradePath, cliFreshPath, cliExistingPath].flatMap((path) => [path, `${path}-journal`, `${path}-shm`, `${path}-wal`])
      .map((path) => rm(path, { force: true })));
    createExistingAuthAndNoteDatabase();
  });

  afterAll(async () => {
    await Promise.all([freshPath, upgradePath, cliFreshPath, cliExistingPath].flatMap((path) => [path, `${path}-journal`, `${path}-shm`, `${path}-wal`])
      .map((path) => rm(path, { force: true })));
  });

  it("deploys the reviewed schema to a fresh SQLite database", async () => {
    await executeMigrations(freshPath, [baselineMigration, task4Migration, reviewExportMigration]);
    const database = new DatabaseSync(freshPath);
    try {
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
      const artifactColumns = database.prepare("PRAGMA table_info('WritingArtifact')").all()
        .map((row) => (row as { name: string }).name);
      expect(artifactColumns).toContain("content");
      const checkpointIndexes = database.prepare("PRAGMA index_list('WritingCheckpoint')").all()
        .map((row) => (row as { name: string }).name);
      expect(checkpointIndexes).not.toContain("WritingCheckpoint_ownerId_sessionId_artifactId_key");
    } finally {
      database.close();
    }
  });

  it("upgrades an existing auth and Note database without losing data", async () => {
    await executeMigrations(upgradePath, [task4Migration, reviewExportMigration]);
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

  it("creates complete Prisma migration history on a fresh migrate deploy", async () => {
    new DatabaseSync(cliFreshPath).close();
    await runPrisma(cliFreshPath, ["migrate", "deploy"]);
    const database = new DatabaseSync(cliFreshPath);
    try {
      const migrations = database.prepare(`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY started_at
      `).all().map((row) => (row as { migration_name: string }).migration_name);
      expect(migrations).toEqual([
        "202608240001_baseline_auth_notes",
        "202608240002_provider_writing",
        "202608240003_reviewed_artifact_export",
      ]);
      expect(tableNames(database)).toEqual(expect.arrayContaining(["Note", "ProviderConfig", "WritingArtifact"]));
    } finally {
      database.close();
    }
  }, 30_000);

  it("baselines an equivalent existing schema before deploy without losing Auth or Note data", async () => {
    await executeMigrations(cliExistingPath, [baselineMigration]);
    const existing = new DatabaseSync(cliExistingPath);
    existing.exec(`
      INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('member-cli', 'cli@example.test', CURRENT_TIMESTAMP);
      INSERT INTO "Note" ("id", "ownerId", "title", "markdown", "updatedAt")
        VALUES ('note-cli', 'member-cli', 'Keep CLI', 'Existing CLI note', CURRENT_TIMESTAMP);
    `);
    existing.close();

    await runPrisma(cliExistingPath, ["migrate", "resolve", "--applied", "202608240001_baseline_auth_notes"]);
    await runPrisma(cliExistingPath, ["migrate", "deploy"]);
    const database = new DatabaseSync(cliExistingPath);
    try {
      expect(database.prepare("SELECT markdown FROM Note WHERE id = 'note-cli'").get()).toEqual({ markdown: "Existing CLI note" });
      const migrations = database.prepare(`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY started_at
      `).all().map((row) => (row as { migration_name: string }).migration_name);
      expect(migrations).toEqual([
        "202608240001_baseline_auth_notes",
        "202608240002_provider_writing",
        "202608240003_reviewed_artifact_export",
      ]);
      expect(tableNames(database)).toEqual(expect.arrayContaining(["ProviderConfig", "WritingCheckpoint", "ProviderConnectionRateLimit"]));
    } finally {
      database.close();
    }
  }, 30_000);
});
