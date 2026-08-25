import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { PrismaResearchSessionStore, ResearchSessionService } from "@/lib/research/sessionStore";
import { PrismaWorkbenchStore, WorkbenchService } from "@/lib/workbench/store";

const clients: PrismaClient[] = [];
async function database() {
  const directory = mkdtempSync(path.join(tmpdir(), "wormhole-p05-"));
  const url = `file:${path.join(directory, "workspace.db").replace(/\\/g, "/")}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } }); clients.push(prisma);
  for (const migrationName of ["202608250001_research_workspace", "202608250002_exploration_workbench"]) {
    const sql = readFileSync(path.join(process.cwd(), "prisma/migrations", migrationName, "migration.sql"), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
  }
  return { prisma, url };
}
afterEach(async () => { await Promise.all(clients.splice(0).map((client) => client.$disconnect())); });

describe("Prisma exploration workbench store", () => {
  it("restores the private user layer through a new Prisma client", async () => {
    const { prisma, url } = await database();
    const research = new ResearchSessionService(new PrismaResearchSessionStore(prisma));
    const session = await research.create("member:alice", { researchQuestion: "Evidence recovery" });
    const service = new WorkbenchService(new PrismaWorkbenchStore(prisma), research);
    const state = await service.get("member:alice", session.id);
    await service.update("member:alice", session.id, { ...state, expectedVersion: 0,
      readingPlan: { ...state.readingPlan, nextAction: "Write the synthesis" } });
    await prisma.$disconnect();

    const restartedClient = new PrismaClient({ datasources: { db: { url } } }); clients.push(restartedClient);
    const restartedResearch = new ResearchSessionService(new PrismaResearchSessionStore(restartedClient));
    const restarted = new WorkbenchService(new PrismaWorkbenchStore(restartedClient), restartedResearch);
    await expect(restarted.get("member:alice", session.id)).resolves.toMatchObject({
      version: 1, readingPlan: { nextAction: "Write the synthesis" },
    });
    await expect(restarted.get("member:bob", session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("atomically rejects one of two concurrent edits", async () => {
    const { prisma, url } = await database();
    const peer = new PrismaClient({ datasources: { db: { url } } }); clients.push(peer);
    const research = new ResearchSessionService(new PrismaResearchSessionStore(prisma));
    const session = await research.create("guest:one", { researchQuestion: "Concurrent workbench" });
    const first = new WorkbenchService(new PrismaWorkbenchStore(prisma), research);
    const second = new WorkbenchService(new PrismaWorkbenchStore(peer), new ResearchSessionService(new PrismaResearchSessionStore(peer)));
    const state = await first.get("guest:one", session.id);
    const input = { ...state, expectedVersion: 0 };
    const results = await Promise.allSettled([first.update("guest:one", session.id, input), second.update("guest:one", session.id, input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("recovers corrupt private JSON without touching research state", async () => {
    const { prisma } = await database();
    const research = new ResearchSessionService(new PrismaResearchSessionStore(prisma));
    const session = await research.create("member:alice", { researchQuestion: "Recovery" });
    const service = new WorkbenchService(new PrismaWorkbenchStore(prisma), research);
    await service.get("member:alice", session.id);
    await prisma.$executeRawUnsafe('UPDATE "ExplorationWorkbench" SET "stateJson" = ? WHERE "sessionId" = ?', "{corrupt-private-json", session.id);
    await expect(service.get("member:alice", session.id)).resolves.toMatchObject({ recoveryWarning: "CORRUPT_WORKBENCH", sessionId: session.id });
    await expect(research.get("member:alice", session.id)).resolves.toMatchObject({ researchQuestion: "Recovery" });
  });
});
