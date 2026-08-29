import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encodeGuestForTest } from "@/lib/auth/principal";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

const temporaryRoot = join(tmpdir(), "wormhole-library-agent-tests");
const databasePath = join(temporaryRoot, `notes-api-${process.pid}.db`);
const databaseURL = `file:${databasePath.replace(/\\/g, "/")}`;
const databaseFiles = [databasePath, `${databasePath}-journal`, `${databasePath}-shm`, `${databasePath}-wal`];
const testOrigin = "http://notes-api.test";

type NoteRepository = typeof import("@/lib/notes/noteRepository");
type NotesRoute = typeof import("@/app/api/v3/notes/route");
type NoteRoute = typeof import("@/app/api/v3/notes/[noteId]/route");

let repository: NoteRepository;
let notesRoute: NotesRoute;
let noteRoute: NoteRoute;

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function migrateTemporaryNotesDatabase() {
  const database = new DatabaseSync(databasePath);
  database.exec(`
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
  `);
  database.close();
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

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

describe("private V3 notes", () => {
  const originalDatabaseURL = process.env.DATABASE_URL;

  beforeAll(async () => {
    await mkdir(dirname(databasePath), { recursive: true });
    process.env.DATABASE_URL = databaseURL;
    migrateTemporaryNotesDatabase();
    vi.resetModules();
    delete (globalThis as { __prisma?: unknown }).__prisma;

    repository = await import("@/lib/notes/noteRepository");
    notesRoute = await import("@/app/api/v3/notes/route");
    noteRoute = await import("@/app/api/v3/notes/[noteId]/route");
  });

  afterAll(async () => {
    const prisma = (globalThis as { __prisma?: { $disconnect(): Promise<void> } }).__prisma;
    await prisma?.$disconnect();
    delete (globalThis as { __prisma?: unknown }).__prisma;
    await Promise.all(databaseFiles.map((file) => rm(file, { force: true })));
    restoreEnvironment("DATABASE_URL", originalDatabaseURL);
  });

  it("returns NOT_FOUND to another owner and CONFLICT for a stale note version", async () => {
    const created = await repository.createNote("owner-a", { title: "A", markdown: "private", links: [] });

    await expect(repository.updateNote("owner-b", created.id, 1, { title: "steal" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await repository.updateNote("owner-a", created.id, 1, { markdown: "v2" });
    await expect(repository.updateNote("owner-a", created.id, 1, { markdown: "lost" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("excludes soft-deleted notes from the owner list and all later accesses", async () => {
    const created = await repository.createNote("owner-delete", { title: "Delete", markdown: "private", links: [] });

    await expect(repository.softDeleteNote("another-owner", created.id))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await repository.softDeleteNote("owner-delete", created.id);

    await expect(repository.listNotes("owner-delete")).resolves.toEqual([]);
    await expect(repository.updateNote("owner-delete", created.id, 1, { title: "resurrect" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("derives the note owner from the signed server principal and rejects a client userId", async () => {
    const ownerA = "a".repeat(43);
    const ownerB = "b".repeat(43);
    const rejected = await notesRoute.POST(guestRequest(ownerA, "/api/v3/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: ownerB, title: "Forged", markdown: "no", links: [] }),
    }));
    expect(rejected.status).toBe(400);
    expectPrivate(rejected);

    const createdResponse = await notesRoute.POST(guestRequest(ownerA, "/api/v3/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Private research",
        markdown: "Only owner A can read this.",
        links: [{ kind: "resource", targetId: "resource-1" }],
      }),
    }));
    expect(createdResponse.status).toBe(201);
    expectPrivate(createdResponse);
    const created = await createdResponse.json() as { id: string; ownerId: string; version: number };
    expect(created.ownerId).toBe(ownerA);
    expect(created.version).toBe(1);

    const ownerList = await notesRoute.GET(guestRequest(ownerA, "/api/v3/notes"));
    expect(ownerList.status).toBe(200);
    expectPrivate(ownerList);
    await expect(ownerList.json()).resolves.toMatchObject([{ id: created.id, ownerId: ownerA }]);

    const nonOwnerUpdate = await noteRoute.PATCH(guestRequest(ownerB, `/api/v3/notes/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, markdown: "steal" }),
    }), { params: Promise.resolve({ noteId: created.id }) });
    expect(nonOwnerUpdate.status).toBe(404);
    expectPrivate(nonOwnerUpdate);

    const updated = await noteRoute.PATCH(guestRequest(ownerA, `/api/v3/notes/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, markdown: "v2" }),
    }), { params: Promise.resolve({ noteId: created.id }) });
    expect(updated.status).toBe(200);
    expectPrivate(updated);

    const stale = await noteRoute.PATCH(guestRequest(ownerA, `/api/v3/notes/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, markdown: "lost" }),
    }), { params: Promise.resolve({ noteId: created.id }) });
    expect(stale.status).toBe(409);
    expectPrivate(stale);

    const deleted = await noteRoute.DELETE(guestRequest(ownerA, `/api/v3/notes/${created.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ noteId: created.id }),
    });
    expect(deleted.status).toBe(204);
    expectPrivate(deleted);

    const afterDelete = await notesRoute.GET(guestRequest(ownerA, "/api/v3/notes"));
    expect(afterDelete.status).toBe(200);
    expectPrivate(afterDelete);
    await expect(afterDelete.json()).resolves.toEqual([]);
  });

  it("rejects a client userId query on every V3 notes route", async () => {
    const owner = "d".repeat(43);
    const noteId = "not-owned-note";
    const responses = await Promise.all([
      notesRoute.GET(guestRequest(owner, "/api/v3/notes?userId=forged-owner")),
      notesRoute.POST(guestRequest(owner, "/api/v3/notes?userId=forged-owner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Forged", markdown: "no", links: [] }),
      })),
      noteRoute.PATCH(guestRequest(owner, `/api/v3/notes/${noteId}?userId=forged-owner`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1, title: "Forged" }),
      }), { params: Promise.resolve({ noteId }) }),
      noteRoute.DELETE(guestRequest(owner, `/api/v3/notes/${noteId}?userId=forged-owner`, { method: "DELETE" }), {
        params: Promise.resolve({ noteId }),
      }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expectPrivate(response);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "BAD_REQUEST" } });
    }
  });

  it("rejects note inputs beyond declared limits or with malformed links", async () => {
    const owner = "e".repeat(43);
    const invalidBodies = [
      { title: "t".repeat(161), markdown: "valid", links: [] },
      { title: "valid", markdown: "m".repeat(50_001), links: [] },
      {
        title: "valid",
        markdown: "valid",
        links: Array.from({ length: 65 }, (_, index) => ({ kind: "resource", targetId: `resource-${index}` })),
      },
      { title: "valid", markdown: "valid", links: [{ kind: "resource" }] },
    ];

    for (const body of invalidBodies) {
      const response = await notesRoute.POST(guestRequest(owner, "/api/v3/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
      expectPrivate(response);
    }
  });

  it("contains unknown principal failures in a private generic route response", async () => {
    const noteId = "not-owned-note";
    vi.doMock("@/lib/auth/requirePrincipal", () => ({
      requirePrincipal: async () => {
        throw new Error("unexpected principal failure");
      },
    }));
    vi.resetModules();

    try {
      const failingNotesRoute = await import("@/app/api/v3/notes/route");
      const failingNoteRoute = await import("@/app/api/v3/notes/[noteId]/route");
      const responses = await Promise.all([
        failingNotesRoute.GET(new Request(`${testOrigin}/api/v3/notes`)),
        failingNotesRoute.POST(new Request(`${testOrigin}/api/v3/notes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "Private", markdown: "no", links: [] }),
        })),
        failingNoteRoute.PATCH(new Request(`${testOrigin}/api/v3/notes/${noteId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion: 1, title: "Private" }),
        }), { params: Promise.resolve({ noteId }) }),
        failingNoteRoute.DELETE(new Request(`${testOrigin}/api/v3/notes/${noteId}`, { method: "DELETE" }), {
          params: Promise.resolve({ noteId }),
        }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(500);
        expectPrivate(response);
        await expect(response.json()).resolves.toEqual({
          error: { code: "INTERNAL_ERROR", message: "Unable to resolve note identity" },
        });
      }
    } finally {
      vi.doUnmock("@/lib/auth/requirePrincipal");
      vi.resetModules();
    }
  });

  it("keeps every V3 notes handler response private when its database is unavailable", async () => {
    const owner = "c".repeat(43);
    const { getPrisma } = await import("@/lib/db/prisma");
    await getPrisma().$executeRawUnsafe('DROP TABLE "Note"');

    const list = await notesRoute.GET(guestRequest(owner, "/api/v3/notes"));
    expect(list.status).toBe(500);
    expectPrivate(list);

    const create = await notesRoute.POST(guestRequest(owner, "/api/v3/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Unavailable", markdown: "db down", links: [] }),
    }));
    expect(create.status).toBe(500);
    expectPrivate(create);

    const patch = await noteRoute.PATCH(guestRequest(owner, "/api/v3/notes/note-id", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, title: "Unavailable" }),
    }), { params: Promise.resolve({ noteId: "note-id" }) });
    expect(patch.status).toBe(500);
    expectPrivate(patch);

    const remove = await noteRoute.DELETE(guestRequest(owner, "/api/v3/notes/note-id", { method: "DELETE" }), {
      params: Promise.resolve({ noteId: "note-id" }),
    });
    expect(remove.status).toBe(500);
    expectPrivate(remove);
  });
});
