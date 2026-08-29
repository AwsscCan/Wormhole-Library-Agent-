import { createRequire } from "node:module";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
const path = resolve(tmpdir(), "wormhole-library-agent-tests", `writing-prisma-${process.pid}.db`);
const url = `file:${path.replace(/\\/g, "/")}`;
const files = [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];
const migrations = [
  resolve(process.cwd(), "prisma", "migrations", "202608200000_initial_schema", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240001_baseline_auth_notes", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240002_provider_writing", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240003_reviewed_artifact_export", "migration.sql"),
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
    await expect(repo.confirmCandidate("owner-a", "s1", stored.id)).resolves.toMatchObject({
      id: stored.id,
      verificationStatus: "verified",
    });

    const rediscovered = await repo.persistCandidate("owner-a", "s1", {
      ...candidate,
      excerpt: "Updated source excerpt.",
    });
    expect(rediscovered).toMatchObject({
      id: stored.id,
      excerpt: "Updated source excerpt.",
      verificationStatus: "verified",
    });
    expect(rediscovered.userConfirmedAt).toBeTruthy();
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

  it("accepts a server-owned seed identity without pretending it has an external URL", async () => {
    const stored = await repo.persistCandidate("owner-a", "s-seed", {
      id: "seed-paper-1",
      title: "Seed paper",
      excerpt: "Locally curated evidence.",
      authors: ["Curator"],
      titleAuthorMatch: "partial",
      provenance: {
        sourceKind: "seed",
        sourceLabel: "本地种子",
        retrievedAt: "2026-08-24T00:00:00.000Z",
        externalId: "seed-paper-1",
      },
      verificationStatus: "needs_review",
    });

    await expect(repo.confirmCandidate("owner-a", "s-seed", stored.id)).resolves.toMatchObject({
      verificationStatus: "verified",
      externalEvidenceId: "seed-paper-1",
    });
  });

  it("advances one server-owned draft artifact through review and returns only its reviewed Markdown", async () => {
    const lifecycle = repo as typeof repo & {
      advanceDraftArtifactStage?: (ownerId: string, sessionId: string, stage: "evidence_link" | "human_review") => Promise<{ artifactId?: string }>;
      exportReviewedArtifact?: (ownerId: string, sessionId: string) => Promise<{ markdown: string; checkpoint: { artifactId?: string } } | null>;
    };
    expect(typeof lifecycle.advanceDraftArtifactStage).toBe("function");
    expect(typeof lifecycle.exportReviewedArtifact).toBe("function");
    const checkpoints = [];
    for (const stage of ["evidence", "verified_sources", "outline", "draft"] as const) {
      checkpoints.push(await repo.persistStage("owner-a", "s2", stage, stage === "draft" ? "# Reviewed draft" : stage));
    }
    checkpoints.push(await lifecycle.advanceDraftArtifactStage!("owner-a", "s2", "evidence_link"));
    checkpoints.push(await lifecycle.advanceDraftArtifactStage!("owner-a", "s2", "human_review"));
    await expect(lifecycle.exportReviewedArtifact!("owner-b", "s2")).resolves.toBeNull();
    const exported = await lifecycle.exportReviewedArtifact!("owner-a", "s2");
    expect(exported?.markdown).toBe("# Reviewed draft");
    checkpoints.push(exported!.checkpoint);
    expect(new Set(checkpoints.slice(3).map(({ artifactId }) => artifactId))).toHaveLength(1);
    await expect(repo.resumeWriting("owner-a", "s2")).resolves.toMatchObject({ stage: "export" });
    await expect(repo.resumeWriting("owner-b", "s2")).resolves.toBeNull();
  });

  it("allows exactly one concurrent connection test in the shared window", async () => {
    const allowed = await Promise.all(Array.from({ length: 8 }, () => repo.consumeConnectionTest("owner-a", "p1")));
    expect(allowed.filter(Boolean)).toHaveLength(1);
  });
});
