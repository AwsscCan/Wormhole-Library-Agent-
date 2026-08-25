import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { PrismaResearchSessionStore, ResearchSessionService } from "@/lib/research/sessionStore";

const clients: PrismaClient[] = [];

async function database() {
  const directory = mkdtempSync(path.join(tmpdir(), "wormhole-prisma-research-"));
  const url = `file:${path.join(directory, "workspace.db").replace(/\\/g, "/")}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  clients.push(prisma);
  const migration = readFileSync(path.join(process.cwd(), "prisma/migrations/202608250001_research_workspace/migration.sql"), "utf8");
  for (const statement of migration.split(";").map((item) => item.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
  return { prisma, url };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.$disconnect()));
});

describe("PrismaResearchSessionStore", () => {
  it("atomically rejects one of two concurrent graph updates", async () => {
    const { prisma, url } = await database();
    const peer = new PrismaClient({ datasources: { db: { url } } });
    clients.push(peer);
    const first = new ResearchSessionService(new PrismaResearchSessionStore(prisma));
    const second = new ResearchSessionService(new PrismaResearchSessionStore(peer));
    const session = await first.create("member:alice", { researchQuestion: "Concurrent graph" });
    const input = { expectedVersion: 0, nodeOverrides: {}, hiddenSystemEdgeIds: [], personalEdges: [] };

    const results = await Promise.allSettled([
      first.updateGraph("member:alice", session.id, input),
      second.updateGraph("member:alice", session.id, input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
  });

  it("restores owner-scoped state through a new Prisma client", async () => {
    const { prisma, url } = await database();
    const first = new ResearchSessionService(new PrismaResearchSessionStore(prisma));
    const session = await first.create("guest:device-a", { researchQuestion: "Restart recovery" });
    await first.addEvidence("guest:device-a", session.id, "evidence-1");
    await prisma.$disconnect();

    const restartedClient = new PrismaClient({ datasources: { db: { url } } });
    clients.push(restartedClient);
    const restarted = new ResearchSessionService(new PrismaResearchSessionStore(restartedClient));
    await expect(restarted.get("guest:device-a", session.id)).resolves.toMatchObject({ evidenceIds: ["evidence-1"] });
    await expect(restarted.get("guest:device-b", session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("upgrades an existing identity database without losing member rows", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "wormhole-upgrade-"));
    const url = `file:${path.join(directory, "upgrade.db").replace(/\\/g, "/")}`;
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    clients.push(prisma);
    await prisma.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT)');
    await prisma.$executeRawUnsafe('INSERT INTO "User" ("id", "name") VALUES (\'alice\', \'Alice\')');
    const migration = readFileSync(path.join(process.cwd(), "prisma/migrations/202608250001_research_workspace/migration.sql"), "utf8");
    for (const statement of migration.split(";").map((item) => item.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
    expect(await prisma.$queryRawUnsafe<Array<{ name: string }>>('SELECT "name" FROM "User" WHERE "id" = \'alice\'')).toEqual([{ name: "Alice" }]);
    expect(await prisma.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name='ResearchSession'")).toEqual([{ name: "ResearchSession" }]);
  });

  it("recovers a corrupt personal graph as an empty private layer", async () => {
    const { prisma } = await database();
    const service = new ResearchSessionService(new PrismaResearchSessionStore(prisma));
    const session = await service.create("member:alice", { researchQuestion: "Corrupt recovery" });
    await prisma.$executeRawUnsafe('UPDATE "ResearchSession" SET "personalGraphJson" = ? WHERE "id" = ?', "{private-corrupt-json", session.id);
    await expect(service.get("member:alice", session.id)).resolves.toMatchObject({
      recoveryWarning: "CORRUPT_PERSONAL_GRAPH",
      personalGraph: { schemaVersion: 1, version: 0, nodeOverrides: {} },
    });
  });
});
