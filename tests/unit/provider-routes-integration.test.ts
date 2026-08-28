import { createRequire } from "node:module";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeGuestForTest } from "@/lib/auth/principal";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
const databasePath = resolve(process.cwd(), ".tmp", `provider-routes-${process.pid}.db`);
const databaseUrl = `file:./../.tmp/${databasePath.split(sep).at(-1)}`;
const databaseFiles = [databasePath, `${databasePath}-journal`, `${databasePath}-shm`, `${databasePath}-wal`];
const migrationPaths = [
  resolve(process.cwd(), "prisma", "migrations", "202608200000_initial_schema", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240001_baseline_auth_notes", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240002_provider_writing", "migration.sql"),
  resolve(process.cwd(), "prisma", "migrations", "202608240003_reviewed_artifact_export", "migration.sql"),
];
const testOrigin = "http://provider-routes.test";
const ownerA = "p".repeat(43);
const ownerB = "q".repeat(43);

type ProvidersRoute = typeof import("@/app/api/v3/providers/route");
type ProviderRoute = typeof import("@/app/api/v3/providers/[providerId]/route");
type ConnectionRoute = typeof import("@/app/api/v3/providers/[providerId]/connection-test/route");
type PresetsRoute = typeof import("@/app/api/v3/model-presets/route");
type ProviderRepository = typeof import("@/lib/llm/providerRepository");
type ProviderAdapter = typeof import("@/lib/llm/providerAdapter");

let providersRoute: ProvidersRoute;
let providerRoute: ProviderRoute;
let connectionRoute: ConnectionRoute;
let presetsRoute: PresetsRoute;
let repository: ProviderRepository;
let adapter: ProviderAdapter;

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

async function createProvider(ownerId = ownerA, apiKey = "initial-secret") {
  const response = await providersRoute.POST(jsonRequest(ownerId, "/api/v3/providers", "POST", {
    name: "Research",
    baseUrl: "https://provider.example.test",
    model: "model-a",
    wireApi: "responses",
    apiKey,
  }));
  return { response, body: await response.json() as { id: string; hasApiKey: boolean } };
}

describe("Provider Prisma and route integration", () => {
  const originalEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    WRITING_CONFIG_ENCRYPTION_KEY: process.env.WRITING_CONFIG_ENCRYPTION_KEY,
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
    providersRoute = await import("@/app/api/v3/providers/route");
    providerRoute = await import("@/app/api/v3/providers/[providerId]/route");
    connectionRoute = await import("@/app/api/v3/providers/[providerId]/connection-test/route");
    presetsRoute = await import("@/app/api/v3/model-presets/route");
    repository = await import("@/lib/llm/providerRepository");
    adapter = await import("@/lib/llm/providerAdapter");
  });

  beforeEach(() => {
    adapter.clearProviderEgressForTest();
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys=ON; DELETE FROM ProviderConnectionRateLimit; DELETE FROM ModelPreset; DELETE FROM ProviderConfig;");
    database.close();
  });

  afterAll(async () => {
    adapter?.clearProviderEgressForTest();
    const prisma = (globalThis as { __prisma?: { $disconnect(): Promise<void> } }).__prisma;
    await prisma?.$disconnect();
    delete (globalThis as { __prisma?: unknown }).__prisma;
    if (originalEnvironment.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
    if (originalEnvironment.WRITING_CONFIG_ENCRYPTION_KEY === undefined) delete process.env.WRITING_CONFIG_ENCRYPTION_KEY;
    else process.env.WRITING_CONFIG_ENCRYPTION_KEY = originalEnvironment.WRITING_CONFIG_ENCRYPTION_KEY;
    await Promise.all(databaseFiles.map((path) => rm(path, { force: true })));
  });

  it("persists encrypted owner-scoped providers while returning only redacted DTOs", async () => {
    const { response, body } = await createProvider();
    expect(response.status).toBe(201);
    expectPrivate(response);
    expect(body.hasApiKey).toBe(true);
    expect(JSON.stringify(body)).not.toContain("initial-secret");

    const ownerList = await providersRoute.GET(guestRequest(ownerA, "/api/v3/providers"));
    const otherList = await providersRoute.GET(guestRequest(ownerB, "/api/v3/providers"));
    await expect(ownerList.json()).resolves.toMatchObject([{ id: body.id, hasApiKey: true }]);
    await expect(otherList.json()).resolves.toEqual([]);
    expectPrivate(ownerList);

    const database = new DatabaseSync(databasePath);
    const stored = database.prepare("SELECT encryptedApiKey FROM ProviderConfig WHERE id = ?").get(body.id) as { encryptedApiKey: string };
    database.close();
    expect(stored.encryptedApiKey).not.toContain("initial-secret");
  });

  it("preserves, replaces and clears a secret and executes the route through the real pinned adapter", async () => {
    const { body } = await createProvider();
    await providerRoute.PATCH(jsonRequest(ownerA, `/api/v3/providers/${body.id}`, "PATCH", { model: "model-b" }), {
      params: Promise.resolve({ providerId: body.id }),
    });
    await expect(repository.getOwnedProviderSecret({ id: ownerA, mode: "guest" }, body.id))
      .resolves.toMatchObject({ apiKey: "initial-secret" });

    const replaced = await providerRoute.PATCH(jsonRequest(ownerA, `/api/v3/providers/${body.id}`, "PATCH", { apiKey: "replacement-secret" }), {
      params: Promise.resolve({ providerId: body.id }),
    });
    expect(replaced.status).toBe(200);
    const sentSecrets: string[] = [];
    adapter.installProviderEgress({
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async (probe) => {
        sentSecrets.push((probe.init.headers as Record<string, string>).authorization);
        return { status: 200, headers: new Headers() };
      },
    });
    const connection = await connectionRoute.POST(guestRequest(ownerA, `/api/v3/providers/${body.id}/connection-test`, {
      method: "POST",
    }), { params: Promise.resolve({ providerId: body.id }) });
    expect(connection.status).toBe(200);
    expectPrivate(connection);
    expect(sentSecrets).toEqual(["Bearer replacement-secret"]);

    const cleared = await providerRoute.PATCH(jsonRequest(ownerA, `/api/v3/providers/${body.id}`, "PATCH", { apiKey: "" }), {
      params: Promise.resolve({ providerId: body.id }),
    });
    await expect(cleared.json()).resolves.toMatchObject({ hasApiKey: false });
    await expect(repository.getOwnedProviderSecret({ id: ownerA, mode: "guest" }, body.id))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("enforces owner routes and cascades presets and rate windows on provider deletion", async () => {
    const { body } = await createProvider();
    const forbiddenPatch = await providerRoute.PATCH(jsonRequest(ownerB, `/api/v3/providers/${body.id}`, "PATCH", { model: "steal" }), {
      params: Promise.resolve({ providerId: body.id }),
    });
    expect(forbiddenPatch.status).toBe(404);
    expectPrivate(forbiddenPatch);

    const preset = await presetsRoute.POST(jsonRequest(ownerA, "/api/v3/model-presets", "POST", {
      name: "Default",
      providerId: body.id,
      model: "model-a",
      temperature: 0.5,
      maxTokens: 500,
    }));
    expect(preset.status).toBe(201);
    const ownPresets = await presetsRoute.GET(guestRequest(ownerA, "/api/v3/model-presets"));
    expect(ownPresets.status).toBe(200);
    await expect(ownPresets.json()).resolves.toEqual([
      expect.objectContaining({ name: "Default", providerId: body.id }),
    ]);
    const foreignPresets = await presetsRoute.GET(guestRequest(ownerB, "/api/v3/model-presets"));
    expect(foreignPresets.status).toBe(200);
    await expect(foreignPresets.json()).resolves.toEqual([]);
    adapter.installProviderEgress({
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => ({ status: 200, headers: new Headers() }),
    });
    const connection = await connectionRoute.POST(guestRequest(ownerA, `/api/v3/providers/${body.id}/connection-test`, {
      method: "POST",
    }), { params: Promise.resolve({ providerId: body.id }) });
    expect(connection.status).toBe(200);

    const deleted = await providerRoute.DELETE(guestRequest(ownerA, `/api/v3/providers/${body.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ providerId: body.id }),
    });
    expect(deleted.status).toBe(204);
    const database = new DatabaseSync(databasePath);
    const counts = {
      presets: (database.prepare("SELECT count(*) AS count FROM ModelPreset").get() as { count: number }).count,
      windows: (database.prepare("SELECT count(*) AS count FROM ProviderConnectionRateLimit").get() as { count: number }).count,
    };
    database.close();
    expect(counts).toEqual({ presets: 0, windows: 0 });
  });

  it("returns private NOT_FOUND before rate limiting a non-owner connection test", async () => {
    const { body } = await createProvider();
    const response = await connectionRoute.POST(guestRequest(ownerB, `/api/v3/providers/${body.id}/connection-test`, {
      method: "POST",
    }), { params: Promise.resolve({ providerId: body.id }) });
    expect(response.status).toBe(404);
    expectPrivate(response);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejects client identity in connection-test body or query without touching egress", async () => {
    const { body } = await createProvider();
    const responses = await Promise.all([
      connectionRoute.POST(jsonRequest(ownerA, `/api/v3/providers/${body.id}/connection-test`, "POST", { userId: ownerB }), {
        params: Promise.resolve({ providerId: body.id }),
      }),
      connectionRoute.POST(guestRequest(ownerA, `/api/v3/providers/${body.id}/connection-test?userId=${ownerB}`, {
        method: "POST",
      }), { params: Promise.resolve({ providerId: body.id }) }),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(400);
      expectPrivate(response);
    }
  });

  it("rejects hostile or malformed origins before key decryption, rate limiting, DNS, or egress", async () => {
    const { body } = await createProvider();
    let lookups = 0;
    let requests = 0;
    adapter.installProviderEgress({
      lookup: async () => { lookups += 1; return [{ address: "93.184.216.34", family: 4 }]; },
      request: async () => { requests += 1; return { status: 200, headers: new Headers() }; },
    });
    const configuredKey = process.env.WRITING_CONFIG_ENCRYPTION_KEY;
    delete process.env.WRITING_CONFIG_ENCRYPTION_KEY;
    try {
      for (const origin of ["https://attacker.example", "not a valid origin"]) {
        const response = await connectionRoute.POST(guestRequest(ownerA, `/api/v3/providers/${body.id}/connection-test`, {
          method: "POST",
          headers: { origin },
        }), { params: Promise.resolve({ providerId: body.id }) });
        expect(response.status).toBe(403);
        expectPrivate(response);
      }
    } finally {
      process.env.WRITING_CONFIG_ENCRYPTION_KEY = configuredKey;
    }
    const database = new DatabaseSync(databasePath);
    const rateRows = (database.prepare("SELECT count(*) AS count FROM ProviderConnectionRateLimit").get() as { count: number }).count;
    database.close();
    expect({ lookups, requests, rateRows }).toEqual({ lookups: 0, requests: 0, rateRows: 0 });
  });

  it("allows an explicit same-origin browser connection test", async () => {
    const { body } = await createProvider();
    adapter.installProviderEgress({
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => ({ status: 200, headers: new Headers() }),
    });
    const response = await connectionRoute.POST(guestRequest(ownerA, `/api/v3/providers/${body.id}/connection-test`, {
      method: "POST",
      headers: { origin: testOrigin },
    }), { params: Promise.resolve({ providerId: body.id }) });
    expect(response.status).toBe(200);
  });

  it("fails provider writes privately when server encryption is not configured", async () => {
    const configured = process.env.WRITING_CONFIG_ENCRYPTION_KEY;
    delete process.env.WRITING_CONFIG_ENCRYPTION_KEY;
    try {
      const { response, body } = await createProvider();
      expect(response.status).toBe(500);
      expectPrivate(response);
      expect(JSON.stringify(body)).not.toContain("initial-secret");
    } finally {
      process.env.WRITING_CONFIG_ENCRYPTION_KEY = configured;
    }
  });
});
