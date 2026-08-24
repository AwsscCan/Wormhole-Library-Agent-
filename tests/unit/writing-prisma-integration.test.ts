import { createRequire } from "node:module";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
const path = resolve(process.cwd(), ".tmp", `writing-prisma-${process.pid}.db`);
const url = `file:./../.tmp/${path.split(sep).at(-1)}`;
const files = [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
const migrations = [
  resolve(process.cwd(), "prisma", "migrations", "202608240001_baseline_auth_notes", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240002_provider_writing", "migration.sql"),
];
const originalDatabaseUrl = process.env.DATABASE_URL;
let repo: typeof import("@/lib/writing/repository");

describe("writing Prisma persistence", () => {
  beforeAll(async () => {
    await mkdir(dirname(path), { recursive: true });
    await Promise.all(files.map((file) => rm(file, { force: true })));
    const database = new DatabaseSync(path);
    database.exec("PRAGMA foreign_keys=ON");
    for (const migration of migrations) database.exec(await readFile(migration, "utf8"));
    database.exec(`
      INSERT INTO ProviderConfig (id, ownerId, name, baseUrl, model, wireApi, createdAt, updatedAt)
      VALUES ('p1', 'owner-a', 'Provider', 'https://provider.example.test', 'm', 'responses', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    database.close();
    process.env.DATABASE_URL = url;
    vi.resetModules();
    delete (globalThis as { __prisma?: unknown }).__prisma;
    repo = await import("@/lib/writing/repository");
  });

  afterAll(async () => {
    const prisma = (globalThis as { __prisma?: { $disconnect(): Promise<void> } }).__prisma;
    await prisma?.$disconnect();
    delete (globalThis as { __prisma?: unknown }).__prisma;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    await Promise.all(files.map((file) => rm(file, { force: true })));
  });

  it("persists owner-scoped candidate confirmation with an internal identifier", async () => {
    const candidate = {
      id: "catalog-e1",
      title: "Focus paper",
      excerpt: "One fact. Another fact.",
      url: "https://example.test/p",
      authors: ["A"],
      titleAuthorMatch: "matched" as const,
      provenance: {
        sourceKind: "openalex" as const,
        sourceLabel: "OpenAlex",
        retrievedAt: "2026-08-24T00:00:00.000Z",
      },
      verificationStatus: "needs_review" as const,
    };
    const stored = await repo.persistCandidate("owner-a", "s1", candidate);
    expect(stored.id).not.toBe(candidate.id);
    expect(stored.externalEvidenceId).toBe(candidate.id);
    await expect(repo.confirmCandidate("owner-b", "s1", stored.id)).resolves.toBeNull();
    await expect(repo.confirmCandidate("owner-a", "s1", stored.id)).resolves.toMatchObject({
      id: stored.id,
      verificationStatus: "verified",
    });
  });

  it("refuses confirmation when title and author match proof is absent", async () => {
    const stored = await repo.persistCandidate("owner-a", "s-proof", {
      id: "catalog-without-match-proof",
      title: "Unmatched paper",
      excerpt: "Unverified fact.",
      url: "https://example.test/unmatched",
      provenance: {
        sourceKind: "openalex",
        sourceLabel: "OpenAlex",
        retrievedAt: "2026-08-24T00:00:00.000Z",
      },
      verificationStatus: "needs_review",
    });
    await expect(repo.confirmCandidate("owner-a", "s-proof", stored.id)).resolves.toBeNull();
  });

  it("persists seven immutable checkpoints and resumes only for the owner", async () => {
    for (const stage of ["evidence", "verified_sources", "outline", "draft", "evidence_link", "human_review", "export"] as const) {
      const checkpoint = await repo.persistStage("owner-a", "s2", stage, stage);
      expect(checkpoint.artifactId).toBeTruthy();
    }
    await expect(repo.resumeWriting("owner-a", "s2")).resolves.toMatchObject({ stage: "export" });
    await expect(repo.resumeWriting("owner-b", "s2")).resolves.toBeNull();
  });

  it("allows exactly one concurrent connection test in the shared window", async () => {
    const allowed = await Promise.all(Array.from({ length: 8 }, () => repo.consumeConnectionTest("owner-a", "p1")));
    expect(allowed.filter(Boolean)).toHaveLength(1);
  });
});
