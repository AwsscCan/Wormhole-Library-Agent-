import { createRequire } from "node:module";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeGuestForTest } from "@/lib/auth/principal";
import type { EvidenceItem, ResearchSessionReadPort, WritingStage } from "@/lib/writing/types";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
const databasePath = join(tmpdir(), "wormhole-library-agent-tests", `writing-routes-${process.pid}.db`);
const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
const databaseFiles = [databasePath, `${databasePath}-journal`, `${databasePath}-shm`, `${databasePath}-wal`];
const migrationPaths = [
  resolve(process.cwd(), "prisma", "migrations", "202608200000_initial_schema", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240001_baseline_auth_notes", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240002_provider_writing", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240003_reviewed_artifact_export", "migration.sql"),
];
const testOrigin = "http://writing-routes.test";
const ownerA = "a".repeat(43);
const ownerB = "b".repeat(43);
const ownerKeyA = `guest:${ownerA}`;
const ownerKeyB = `guest:${ownerB}`;

type PortsModule = typeof import("@/lib/writing/ports");
type DraftRoute = typeof import("@/app/api/v3/writing/drafts/route");
type CandidateRoute = typeof import("@/app/api/v3/writing/candidates/route");
type StageRoute = typeof import("@/app/api/v3/writing/stages/route");
type ReviewRoute = typeof import("@/app/api/v3/writing/review/route");
type ExportRoute = typeof import("@/app/api/v3/writing/export/route");
type ProviderRepository = typeof import("@/lib/llm/providerRepository");
type ProviderAdapter = typeof import("@/lib/llm/providerAdapter");
type Instrumentation = typeof import("@/instrumentation");
type ResearchSessionStore = typeof import("@/lib/research/sessionStore");

let ports: PortsModule;
let draftRoute: DraftRoute;
let candidateRoute: CandidateRoute;
let stageRoute: StageRoute;
let reviewRoute: ReviewRoute;
let exportRoute: ExportRoute;
let providerRepository: ProviderRepository;
let providerAdapter: ProviderAdapter;
let instrumentation: Instrumentation;
let researchSessionStore: ResearchSessionStore;

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
  ["session-a", { id: "session-a", ownerId: ownerKeyA, researchQuestion: "Question A", evidenceIds: ["a1", "a2", "a3"] }],
  ["session-b", { id: "session-b", ownerId: ownerKeyB, researchQuestion: "Question B", evidenceIds: ["b1", "b2", "b3"] }],
  ["state-session", { id: "state-session", ownerId: ownerKeyA, researchQuestion: "State", evidenceIds: ["s1", "s2", "s3"] }],
  ["focus-session", {
    id: "focus-session",
    ownerId: ownerKeyA,
    researchQuestion: "Methods",
    evidenceIds: [
      ...Array.from({ length: 15 }, (_, index) => `unrelated-${index + 1}`),
      "method-1",
      "method-2",
      "method-3",
    ],
  }],
  ["provider-success-session", {
    id: "provider-success-session",
    ownerId: ownerKeyA,
    researchQuestion: "Provider methods",
    evidenceIds: [
      ...Array.from({ length: 15 }, (_, index) => `unrelated-${index + 1}`),
      "method-1",
      "method-2",
      "method-3",
    ],
  }],
  ["missing-session", {
    id: "missing-session",
    ownerId: ownerKeyA,
    researchQuestion: "Missing",
    evidenceIds: ["available", "missing-1", "missing-2"],
  }],
  ["review-session", {
    id: "review-session",
    ownerId: ownerKeyA,
    researchQuestion: "Review",
    evidenceIds: ["review-1", "review-2", "review-3"],
  }],
  ["provider-failure-session", {
    id: "provider-failure-session",
    ownerId: ownerKeyA,
    researchQuestion: "Provider failure",
    evidenceIds: ["failure-1", "failure-2", "failure-3"],
  }],
  ["provider-no-key-session", {
    id: "provider-no-key-session",
    ownerId: ownerKeyA,
    researchQuestion: "Provider without key",
    evidenceIds: ["no-key-1", "no-key-2", "no-key-3"],
  }],
  ["provider-one-marker-session", {
    id: "provider-one-marker-session",
    ownerId: ownerKeyA,
    researchQuestion: "Insufficient Provider evidence",
    evidenceIds: ["one-marker-1", "one-marker-2", "one-marker-3"],
  }],
  ["provider-tail-session", {
    id: "provider-tail-session",
    ownerId: ownerKeyA,
    researchQuestion: "Uncited Provider tail",
    evidenceIds: ["tail-1", "tail-2", "tail-3"],
  }],
  ["legacy-blank-review-session", {
    id: "legacy-blank-review-session",
    ownerId: ownerKeyA,
    researchQuestion: "Legacy blank review",
    evidenceIds: ["legacy-review-1", "legacy-review-2", "legacy-review-3"],
  }],
  ["legacy-blank-export-session", {
    id: "legacy-blank-export-session",
    ownerId: ownerKeyA,
    researchQuestion: "Legacy blank export",
    evidenceIds: ["legacy-export-1", "legacy-export-2", "legacy-export-3"],
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
    addEvidence: async ({ sessionId, evidenceId }) => {
      const session = sessions.get(sessionId);
      if (!session) return;
      session.evidenceIds = [...new Set([...session.evidenceIds, evidenceId])];
    },
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
  const originalEnvironment = {
    databaseUrl: process.env.DATABASE_URL,
    encryptionKey: process.env.WRITING_CONFIG_ENCRYPTION_KEY,
  };

  beforeAll(async () => {
    await mkdir(dirname(databasePath), { recursive: true });
    await Promise.all(databaseFiles.map((path) => rm(path, { force: true })));
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys=ON");
    for (const path of migrationPaths) database.exec(await readFile(path, "utf8"));
    database.close();
    process.env.DATABASE_URL = databaseUrl;
    process.env.WRITING_CONFIG_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    vi.resetModules();
    delete (globalThis as { __prisma?: unknown }).__prisma;
    ports = await import("@/lib/writing/ports");
    draftRoute = await import("@/app/api/v3/writing/drafts/route");
    candidateRoute = await import("@/app/api/v3/writing/candidates/route");
    stageRoute = await import("@/app/api/v3/writing/stages/route");
    reviewRoute = await import("@/app/api/v3/writing/review/route");
    exportRoute = await import("@/app/api/v3/writing/export/route");
    providerRepository = await import("@/lib/llm/providerRepository");
    providerAdapter = await import("@/lib/llm/providerAdapter");
    instrumentation = await import("@/instrumentation");
    researchSessionStore = await import("@/lib/research/sessionStore");
  });

  beforeEach(() => {
    ports.clearWritingPortsForTest();
    providerAdapter.clearProviderEgressForTest();
  });

  afterAll(async () => {
    ports?.clearWritingPortsForTest();
    researchSessionStore?.clearResearchSessionServiceForTests();
    const prisma = (globalThis as { __prisma?: { $disconnect(): Promise<void> } }).__prisma;
    await prisma?.$disconnect();
    delete (globalThis as { __prisma?: unknown }).__prisma;
    if (originalEnvironment.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnvironment.databaseUrl;
    if (originalEnvironment.encryptionKey === undefined) delete process.env.WRITING_CONFIG_ENCRYPTION_KEY;
    else process.env.WRITING_CONFIG_ENCRYPTION_KEY = originalEnvironment.encryptionKey;
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
      reviewRoute.POST(jsonRequest(ownerA, "/api/v3/writing/review", "POST", {
        sessionId: "state-session",
        stage: "evidence_link",
      })),
      exportRoute.POST(jsonRequest(ownerA, "/api/v3/writing/export", "POST", {
        sessionId: "state-session",
      })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expectPrivate(response);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "DEPENDENCY_UNAVAILABLE" } });
    }
  });

  it("registers production composition for namespaced research owners", async () => {
    ports.clearWritingPortsForTest();
    researchSessionStore.clearResearchSessionServiceForTests();
    const previousRuntime = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = "nodejs";
    try {
      await instrumentation.register();
    } finally {
      if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME;
      else process.env.NEXT_RUNTIME = previousRuntime;
    }

    const session = await researchSessionStore.getResearchSessionService().create(ownerKeyA, {
      researchQuestion: "composition wiring",
    });

    const response = await stageRoute.POST(jsonRequest(ownerA, "/api/v3/writing/stages", "POST", {
      sessionId: session.id,
      stage: "evidence",
      content: "[]",
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ownerId: ownerKeyA,
      sessionId: session.id,
      stage: "evidence",
    });

    const forbidden = await stageRoute.POST(jsonRequest(ownerB, "/api/v3/writing/stages", "POST", {
      sessionId: session.id,
      stage: "verified_sources",
      content: "[]",
    }));
    expect(forbidden.status).toBe(404);

    const database = new DatabaseSync(databasePath);
    const rows = database.prepare("SELECT ownerId, sessionId, stage FROM WritingCheckpoint WHERE sessionId = ?")
      .all(session.id);
    database.close();
    expect(rows).toEqual([{ ownerId: ownerKeyA, sessionId: session.id, stage: "evidence" }]);
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
      { ownerId: ownerKeyA, sessionId: "session-a", externalEvidenceId: "catalog-shared", verificationStatus: "verified" },
      { ownerId: ownerKeyB, sessionId: "session-b", externalEvidenceId: "catalog-shared", verificationStatus: "needs_review" },
    ]);
  });

  it("binds the generated draft artifact to explicit evidence review before same-owner server export", async () => {
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

    for (const stage of ["evidence", "verified_sources", "outline"] as WritingStage[]) {
      const response = await stageRoute.POST(jsonRequest(ownerA, "/api/v3/writing/stages", "POST", {
        sessionId: "state-session",
        stage,
        content: `immutable-${stage}`,
      }));
      expect(response.status).toBe(201);
      expectPrivate(response);
    }

    const generatedResponse = await draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
      sessionId: "state-session",
      focus: "reviewed methods",
      evidenceIds: ["s1", "s2", "s3"],
    }));
    expect(generatedResponse.status).toBe(201);
    const generated = await generatedResponse.json() as { markdown: string };

    const injected = await stageRoute.POST(jsonRequest(ownerA, "/api/v3/writing/stages", "POST", {
      sessionId: "state-session",
      stage: "evidence_link",
      content: "attacker-controlled replacement markdown",
    }));
    expect(injected.status).toBe(400);
    const earlyExport = await exportRoute.POST(jsonRequest(ownerA, "/api/v3/writing/export", "POST", {
      sessionId: "state-session",
    }));
    expect(earlyExport.status).toBe(400);

    const evidenceLink = await reviewRoute.POST(jsonRequest(ownerA, "/api/v3/writing/review", "POST", {
      sessionId: "state-session",
      stage: "evidence_link",
    }));
    expect(evidenceLink.status).toBe(201);
    const unconfirmedReview = await reviewRoute.POST(jsonRequest(ownerA, "/api/v3/writing/review", "POST", {
      sessionId: "state-session",
      stage: "human_review",
      confirmed: false,
    }));
    expect(unconfirmedReview.status).toBe(400);
    const confirmedReview = await reviewRoute.POST(jsonRequest(ownerA, "/api/v3/writing/review", "POST", {
      sessionId: "state-session",
      stage: "human_review",
      confirmed: true,
    }));
    expect(confirmedReview.status).toBe(201);

    const forbiddenExport = await exportRoute.POST(jsonRequest(ownerB, "/api/v3/writing/export", "POST", {
      sessionId: "state-session",
    }));
    expect(forbiddenExport.status).toBe(403);
    const exported = await exportRoute.POST(jsonRequest(ownerA, "/api/v3/writing/export", "POST", {
      sessionId: "state-session",
    }));
    expect(exported.status).toBe(200);
    expectPrivate(exported);
    expect(exported.headers.get("content-type")).toContain("text/markdown");
    expect(exported.headers.get("content-disposition")).toContain("attachment");
    await expect(exported.text()).resolves.toBe(generated.markdown);
    const regenerated = await draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
      sessionId: "state-session",
      focus: "unpersisted replacement",
      evidenceIds: ["s1", "s2", "s3"],
    }));
    expect(regenerated.status).toBe(400);

    const database = new DatabaseSync(databasePath);
    const checkpoints = database.prepare("SELECT stage, artifactId FROM WritingCheckpoint WHERE ownerId = ? AND sessionId = ? ORDER BY createdAt, rowid")
      .all(ownerKeyA, "state-session") as Array<{ stage: string; artifactId: string }>;
    const artifacts = database.prepare("SELECT stage, contentHash, content FROM WritingArtifact WHERE ownerId = ? AND sessionId = ? ORDER BY createdAt, rowid")
      .all(ownerKeyA, "state-session") as Array<{ stage: string; contentHash: string; content: string }>;
    database.close();
    expect(checkpoints.map(({ stage }) => stage)).toEqual([
      "evidence", "verified_sources", "outline", "draft", "evidence_link", "human_review", "export",
    ]);
    expect(new Set(checkpoints.slice(3).map(({ artifactId }) => artifactId))).toHaveLength(1);
    expect(artifacts).toHaveLength(4);
    expect(artifacts.every(({ contentHash }) => /^[a-f0-9]{64}$/.test(contentHash))).toBe(true);
    expect(artifacts.find(({ stage }) => stage === "draft")?.content).toBe(generated.markdown);
  });

  it("persists and restores the literature-review template with its evidence-bound artifact", async () => {
    installPorts();
    const created = await draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
      sessionId: "review-session",
      focus: "retrieval augmented generation",
      evidenceIds: ["review-1", "review-2", "review-3"],
      templateId: "literature_review",
    }));

    expect(created.status).toBe(201);
    const draft = await created.json() as { markdown: string; templateId: string };
    expect(draft.templateId).toBe("literature_review");
    expect(draft.markdown).toContain("文献综述：retrieval augmented generation");

    const restored = await draftRoute.GET(guestRequest(ownerA, "/api/v3/writing/drafts?sessionId=review-session"));
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({
      templateId: "literature_review",
      markdown: draft.markdown,
      source: "restored",
    });
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

  it("uses only the caller-selected verified evidence even when unselected session evidence scores higher", async () => {
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
    expect(draft.citations.map(({ evidenceId }) => evidenceId)).toEqual(["unrelated-1", "unrelated-2", "unrelated-3"]);
    expect(draft.markdown).not.toContain("method-1");
  });

  it("uses the owner step preset before lower-precedence presets and sends only selected evidence to provider generation", async () => {
    installPorts();
    const principal = { id: ownerA, mode: "guest" } as const;
    const provider = await providerRepository.createProvider(principal, {
      name: "Writing provider",
      baseUrl: "https://provider.example.test",
      model: "provider-default",
      wireApi: "responses",
      apiKey: "owner-secret",
    });
    const presets = await Promise.all(["step", "workflow", "role", "default"].map((name) =>
      providerRepository.createPreset(principal, {
        name,
        providerId: provider.id,
        model: `${name}-model`,
        temperature: 0.2,
        maxTokens: 600,
      })));
    let providerPayload = "";
    providerAdapter.installProviderEgress({
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async (probe) => {
        providerPayload = String(probe.init.body);
        return {
          status: 200,
          headers: new Headers(),
          body: JSON.stringify({ output_text: "Provider synthesis. [unrelated-1] Provider comparison. [unrelated-2] Provider conclusion. [unrelated-3]" }),
        };
      },
    });

    const response = await draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
      sessionId: "provider-success-session",
      focus: "methods",
      evidenceIds: ["unrelated-1", "unrelated-2", "unrelated-3"],
      stepPresetId: presets[0].id,
      workflowPresetId: presets[1].id,
      rolePresetId: presets[2].id,
      userDefaultPresetId: presets[3].id,
    }));
    expect(response.status).toBe(201);
    const draft = await response.json() as { source: string; markdown: string; citations: Array<{ evidenceId: string }> };
    expect(draft.source).toBe("provider");
    expect(draft.markdown).toContain("Provider synthesis");
    expect(JSON.parse(providerPayload)).toMatchObject({ model: "step-model" });
    expect(providerPayload).toContain("unrelated-1");
    expect(providerPayload).not.toContain("method-1");
  });

  it("falls back deterministically when the selected owner model fails or its Provider has no key", async () => {
    installPorts();
    const principal = { id: ownerA, mode: "guest" } as const;
    const failingProvider = await providerRepository.createProvider(principal, {
      name: "Failing provider",
      baseUrl: "https://provider-failure.example.test",
      model: "provider-default",
      wireApi: "chat_completions",
      apiKey: "owner-secret",
    });
    const failingPreset = await providerRepository.createPreset(principal, {
      name: "Failing preset",
      providerId: failingProvider.id,
      model: "failing-model",
      temperature: 0,
      maxTokens: 100,
    });
    let transportAttempts = 0;
    providerAdapter.installProviderEgress({
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => { transportAttempts += 1; throw new Error("mock model failure"); },
    });
    const failedModel = await draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
      sessionId: "provider-failure-session",
      focus: "failure",
      evidenceIds: ["failure-1", "failure-2", "failure-3"],
      stepPresetId: failingPreset.id,
    }));
    expect(failedModel.status).toBe(201);
    await expect(failedModel.json()).resolves.toMatchObject({ source: "deterministic" });
    expect(transportAttempts).toBe(1);

    const noKeyProvider = await providerRepository.createProvider(principal, {
      name: "No-key provider",
      baseUrl: "https://provider-no-key.example.test",
      model: "provider-default",
      wireApi: "anthropic_messages",
    });
    const noKeyPreset = await providerRepository.createPreset(principal, {
      name: "No-key preset",
      providerId: noKeyProvider.id,
      model: "no-key-model",
      temperature: 0,
      maxTokens: 100,
    });
    const noKey = await draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
      sessionId: "provider-no-key-session",
      focus: "no key",
      evidenceIds: ["no-key-1", "no-key-2", "no-key-3"],
      stepPresetId: noKeyPreset.id,
    }));
    expect(noKey.status).toBe(201);
    await expect(noKey.json()).resolves.toMatchObject({ source: "deterministic" });
    expect(transportAttempts).toBe(1);
  });

  it.each([
    {
      name: "uses fewer than three distinct evidence markers",
      sessionId: "provider-one-marker-session",
      evidenceIds: ["one-marker-1", "one-marker-2", "one-marker-3"],
      providerMarkdown: "Only one source is cited. [one-marker-1]",
    },
    {
      name: "has an uncited unpunctuated factual tail",
      sessionId: "provider-tail-session",
      evidenceIds: ["tail-1", "tail-2", "tail-3"],
      providerMarkdown: "Supported fact. [tail-1]\nSecond fact. [tail-2]\nThird fact. [tail-3]\nUnsupported factual tail",
    },
  ])("falls back deterministically when Provider output $name", async ({ sessionId, evidenceIds, providerMarkdown }) => {
    installPorts();
    const principal = { id: ownerA, mode: "guest" } as const;
    const provider = await providerRepository.createProvider(principal, {
      name: `Validation provider ${sessionId}`,
      baseUrl: `https://${sessionId}.example.test`,
      model: "provider-default",
      wireApi: "responses",
      apiKey: "owner-secret",
    });
    const preset = await providerRepository.createPreset(principal, {
      name: `Validation preset ${sessionId}`,
      providerId: provider.id,
      model: "validation-model",
      temperature: 0,
      maxTokens: 200,
    });
    providerAdapter.installProviderEgress({
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => ({ status: 200, headers: new Headers(), body: JSON.stringify({ output_text: providerMarkdown }) }),
    });

    const response = await draftRoute.POST(jsonRequest(ownerA, "/api/v3/writing/drafts", "POST", {
      sessionId,
      focus: "validation",
      evidenceIds,
      stepPresetId: preset.id,
    }));
    expect(response.status).toBe(201);
    const draft = await response.json() as { source: string; markdown: string; citations: Array<{ evidenceId: string }> };
    expect(draft.source).toBe("deterministic");
    expect(draft.markdown).not.toBe(providerMarkdown);
    expect(draft.citations.map(({ evidenceId }) => evidenceId)).toEqual(evidenceIds);
  });

  it("rejects review and export for blank legacy artifacts", async () => {
    installPorts();
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        INSERT INTO "WritingArtifact" ("id", "ownerId", "sessionId", "stage", "contentHash", "content")
          VALUES ('legacy-review-artifact', '${ownerKeyA}', 'legacy-blank-review-session', 'draft', 'legacy-hash', '');
        INSERT INTO "WritingCheckpoint" ("id", "ownerId", "sessionId", "stage", "artifactId")
          VALUES ('legacy-review-draft', '${ownerKeyA}', 'legacy-blank-review-session', 'draft', 'legacy-review-artifact');
        INSERT INTO "WritingArtifact" ("id", "ownerId", "sessionId", "stage", "contentHash", "content")
          VALUES ('legacy-export-artifact', '${ownerKeyA}', 'legacy-blank-export-session', 'draft', 'legacy-hash', '   ');
        INSERT INTO "WritingCheckpoint" ("id", "ownerId", "sessionId", "stage", "artifactId") VALUES
          ('legacy-export-draft', '${ownerKeyA}', 'legacy-blank-export-session', 'draft', 'legacy-export-artifact'),
          ('legacy-export-evidence', '${ownerKeyA}', 'legacy-blank-export-session', 'evidence_link', 'legacy-export-artifact'),
          ('legacy-export-review', '${ownerKeyA}', 'legacy-blank-export-session', 'human_review', 'legacy-export-artifact');
      `);
    } finally {
      database.close();
    }

    const review = await reviewRoute.POST(jsonRequest(ownerA, "/api/v3/writing/review", "POST", {
      sessionId: "legacy-blank-review-session",
      stage: "evidence_link",
    }));
    expect(review.status).toBe(400);
    const exported = await exportRoute.POST(jsonRequest(ownerA, "/api/v3/writing/export", "POST", {
      sessionId: "legacy-blank-export-session",
    }));
    expect(exported.status).toBe(400);
  });
});
