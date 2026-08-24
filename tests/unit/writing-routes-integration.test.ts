import { createRequire } from "node:module";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeGuestForTest } from "@/lib/auth/principal";
import type { EvidenceItem, ResearchSessionReadPort, WritingStage } from "@/lib/writing/types";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
const databasePath = resolve(process.cwd(), ".tmp", `writing-routes-${process.pid}.db`);
const databaseUrl = `file:./../.tmp/${databasePath.split(sep).at(-1)}`;
const databaseFiles = [databasePath, `${databasePath}-journal`, `${databasePath}-shm`, `${databasePath}-wal`];
const migrationPaths = [
  resolve(process.cwd(), "prisma", "migrations", "202608240001_baseline_auth_notes", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240002_provider_writing", "migration.sql"),
];
const testOrigin = "http://writing-routes.test";
const ownerA = "a".repeat(43);
const ownerB = "b".repeat(43);

type PortsModule = typeof import("@/lib/writing/ports");
type DraftRoute = typeof import("@/app/api/v3/writing/drafts/route");
type CandidateRoute = typeof import("@/app/api/v3/writing/candidates/route");
type StageRoute = typeof import("@/app/api/v3/writing/stages/route");

let ports: PortsModule;
let draftRoute: DraftRoute;
let candidateRoute: CandidateRoute;
let stageRoute: StageRoute;

const evidence = (id: string): EvidenceItem => ({
  id,
  title: id.startsWith("method-") ? `Methods paper ${id}` : `Title ${id}`,
  excerpt: id === "method-1" ? "事实一。事实二。One.One." : `Evidence sentence for ${id}.`,
  url: `https://example.test/${id}`,
  authors: ["Researcher"],
  titleAuthorMatch: "matched",
  provenance: {
    sourceKind: "openalex",
    sourceLabel: "OpenAlex",
    retrievedAt: "2026-08-24T00:00:00.000Z",
    externalId: id,
  },
  verificationStatus: "verified",
  userConfirmedAt: "2026-08-24T00:00:00.000Z",
});

const sessions = new Map<string, ResearchSessionReadPort>([
  ["session-a", { id: "session-a", ownerId: ownerA, researchQuestion: "Question A", evidenceIds: ["a1", "a2", "a3"] }],
  ["session-b", { id: "session-b", ownerId: ownerB, researchQuestion: "Question B", evidenceIds: ["b1", "b2", "b3"] }],
  ["state-session", { id: "state-session", ownerId: ownerA, researchQuestion: "State", evidenceIds: ["s1", "s2", "s3"] }],
  ["focus-session", {
    id: "focus-session",
    ownerId: ownerA,
    researchQuestion: "Methods",
    evidenceIds: [
      ...Array.from({ length: 15 }, (_, index) => `unrelated-${index + 1}`),
      "method-1",
      "method-2",
      "method-3",
    ],
  }],
  ["missing-session", {
    id: "missing-session",
    ownerId: ownerA,
    researchQuestion: "Missing",
    evidenceIds: ["available", "missing-1", "missing-2"],
  }],
]);

function installPorts() {
  ports.installWritingPorts({
    session: async ({ sessionId }) => sessions.get(sessionId) ?? null,
    evidence: async ({ evidenceId }) => evidenceId.startsWith("missing-") ? null : evidence(evidenceId),
    discover: async () => [{
      ...evidence("catalog-shared"),
      verificationStatus: "verified",
      userConfirmedAt: "forged-by-catalog",
    }],
  });
}

function guestRequest(ownerId: string, path: string, init: RequestInit = {}) {
  return new Request(`${testOrigin}${path}`, {
    ...init,
    headers: {
      cookie: `wl_guest=${encodeGuestForTest(ownerId)}`,
      ...init.headers,
    },
  });
}

function jsonRequest(ownerId: string, path: string, method: string, body: unknown) {
  return guestRequest(ownerId, path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

describe("production writing route integration", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    await mkdir(dirname(databasePath), { recursive: true });
    await Promise.all(databaseFiles.map((path) => rm(path, { force: true })));
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys=ON");
    for (const path of migrationPaths) database.exec(await readFile(path, "utf8"));
    database.close();
    process.env.DATABASE_URL = databaseUrl;
    vi.resetModules();
    delete (globalThis as { __prisma?: unknown }).__prisma;
    ports = await import("@/lib/writing/ports");
    draftRoute = await import("@/app/api/v3/writing/drafts/route");
    candidateRoute = await import("@/app/api/v3/writing/candidates/route");
    stageRoute = await import("@/app/api/v3/writing/stages/route");
  });

  beforeEach(() => {
    ports.clearWritingPortsForTest();
  });

  afterAll(async () => {
    ports?.clearWritingPortsForTest();
    const prisma = (globalThis as { __prisma?: { $disconnect(): Promise<void> } }).__prisma;
    await prisma?.$disconnect();
    delete (globalThis as { __prisma?: unknown }).__prisma;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    await Promise.all(databaseFiles.map((path) => rm(path, { force: true })));
  });

  it("returns an explicit private 503 when the server-only ports are not installed", async () => {
    const responses = await Promise.all([
      draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
        sessionId: "session-a",
        focus: "methods",
        evidenceIds: ["a1", "a2", "a3"],
      })),
      candidateRoute.POST(jsonRequest(ownerA, "/api/v3/writing/candidates", "POST", {
        sessionId: "session-a",
        researchQuestion: "Question A",
      })),
      stageRoute.POST(jsonRequest(ownerA, "/api/v3/writing/stages", "POST", {
        sessionId: "state-session",
        stage: "evidence",
        content: "evidence",
      })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expectPrivate(response);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "DEPENDENCY_UNAVAILABLE" } });
    }
  });

  it("validates the owner session and persists automatic catalog results as pending", async () => {
    installPorts();
    const forbidden = await candidateRoute.POST(jsonRequest(ownerB, "/api/v3/writing/candidates", "POST", {
      sessionId: "session-a",
      researchQuestion: "Forged",
    }));
    expect(forbidden.status).toBe(403);
    expectPrivate(forbidden);

    const first = await candidateRoute.POST(jsonRequest(ownerA, "/api/v3/writing/candidates", "POST", {
      sessionId: "session-a",
      researchQuestion: "Question A",
    }));
    const second = await candidateRoute.POST(jsonRequest(ownerB, "/api/v3/writing/candidates", "POST", {
      sessionId: "session-b",
      researchQuestion: "Question B",
    }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expectPrivate(first);
    const firstBody = await first.json() as { candidates: Array<{ id: string; externalEvidenceId: string; verificationStatus: string }> };
    const secondBody = await second.json() as { candidates: Array<{ id: string; externalEvidenceId: string; verificationStatus: string }> };
    expect(firstBody.candidates[0]).toMatchObject({ externalEvidenceId: "catalog-shared", verificationStatus: "needs_review" });
    expect(secondBody.candidates[0]).toMatchObject({ externalEvidenceId: "catalog-shared", verificationStatus: "needs_review" });
    expect(firstBody.candidates[0].id).not.toBe(secondBody.candidates[0].id);

    const confirmed = await candidateRoute.PATCH(jsonRequest(ownerA, "/api/v3/writing/candidates", "PATCH", {
      sessionId: "session-a",
      evidenceId: firstBody.candidates[0].id,
    }));
    expect(confirmed.status).toBe(200);
    expectPrivate(confirmed);
    await expect(confirmed.json()).resolves.toMatchObject({
      id: firstBody.candidates[0].id,
      externalEvidenceId: "catalog-shared",
      verificationStatus: "verified",
    });

    const database = new DatabaseSync(databasePath);
    const rows = database.prepare("SELECT ownerId, sessionId, externalEvidenceId, verificationStatus FROM WritingEvidence ORDER BY ownerId").all();
    database.close();
    expect(rows).toEqual([
      { ownerId: ownerA, sessionId: "session-a", externalEvidenceId: "catalog-shared", verificationStatus: "verified" },
      { ownerId: ownerB, sessionId: "session-b", externalEvidenceId: "catalog-shared", verificationStatus: "needs_review" },
    ]);
  });

  it("derives every transition from the last owner/session checkpoint and stores immutable artifacts", async () => {
    installPorts();
    const forged = await stageRoute.POST(jsonRequest(ownerA, "/api/v3/writing/stages", "POST", {
      sessionId: "state-session",
      previous: "outline",
      stage: "draft",
      content: "forged",
    }));
    expect(forged.status).toBe(400);
    const skipped = await stageRoute.POST(jsonRequest(ownerA, "/api/v3/writing/stages", "POST", {
      sessionId: "state-session",
      stage: "draft",
      content: "skip persisted state",
    }));
    expect(skipped.status).toBe(400);

    for (const stage of ["evidence", "verified_sources", "outline", "draft", "evidence_link", "human_review", "export"] as WritingStage[]) {
      const response = await stageRoute.POST(jsonRequest(ownerA, "/api/v3/writing/stages", "POST", {
        sessionId: "state-session",
        stage,
        content: `immutable-${stage}`,
      }));
      expect(response.status).toBe(201);
      expectPrivate(response);
    }

    const database = new DatabaseSync(databasePath);
    const checkpoints = database.prepare("SELECT stage, artifactId FROM WritingCheckpoint WHERE ownerId = ? AND sessionId = ? ORDER BY createdAt, rowid")
      .all(ownerA, "state-session") as Array<{ stage: string; artifactId: string }>;
    const artifacts = database.prepare("SELECT stage, contentHash FROM WritingArtifact WHERE ownerId = ? AND sessionId = ? ORDER BY createdAt, rowid")
      .all(ownerA, "state-session") as Array<{ stage: string; contentHash: string }>;
    database.close();
    expect(checkpoints.map(({ stage }) => stage)).toEqual([
      "evidence", "verified_sources", "outline", "draft", "evidence_link", "human_review", "export",
    ]);
    expect(new Set(checkpoints.map(({ artifactId }) => artifactId))).toHaveLength(7);
    expect(artifacts).toHaveLength(7);
    expect(artifacts.every(({ contentHash }) => /^[a-f0-9]{64}$/.test(contentHash))).toBe(true);
  });

  it("rejects a session evidence list containing missing records", async () => {
    installPorts();
    const missing = await draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
      sessionId: "missing-session",
      focus: "methods",
      evidenceIds: ["available", "missing-1", "missing-2"],
    }));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST", message: expect.stringContaining("missing") },
    });
  });

  it("selects bounded focus context from the complete session list and marks every sentence", async () => {
    installPorts();
    const response = await draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
      sessionId: "focus-session",
      focus: "methods",
      evidenceIds: ["unrelated-1", "unrelated-2", "unrelated-3"],
    }));
    expect(response.status).toBe(201);
    const draft = await response.json() as { markdown: string; source: string; checkpointId: string; citations: Array<{ evidenceId: string }> };
    expect(draft.source).toBe("deterministic");
    expect(draft.checkpointId).toBeTruthy();
    expect(draft.citations).toHaveLength(12);
    expect(draft.citations.slice(0, 3).map(({ evidenceId }) => evidenceId)).toEqual(["method-1", "method-2", "method-3"]);
    expect(draft.markdown.match(/\[method-1\]/g)).toHaveLength(4);
  });
});
