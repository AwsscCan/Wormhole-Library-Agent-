import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ResearchSessionService } from "@/lib/research/sessionStore";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import { ResearchError } from "@/lib/research/types";
import { validateEvidenceGraph } from "./links";
import type { WorkbenchState, WorkbenchUpdateInput } from "./types";

type WorkbenchRow = {
  sessionId: string; ownerId: string; stateJson: string; version: number; createdAt: Date | string; updatedAt: Date | string;
};

export interface WorkbenchStore {
  get(ownerId: string, sessionId: string): Promise<WorkbenchState | null>;
  createIfMissing(state: WorkbenchState): Promise<WorkbenchState>;
  update(ownerId: string, sessionId: string, expectedVersion: number, state: WorkbenchState): Promise<"updated" | "conflict" | "not_found">;
}

const emptyView = () => ({ nodePositions: {}, hiddenNodeIds: [], personalEdges: [] });
function initialState(ownerId: string, sessionId: string, researchQuestion: string, now: string): WorkbenchState {
  return {
    schemaVersion: 1, sessionId, ownerId, version: 0, surpriseLevel: "medium",
    readingPlan: { goal: researchQuestion, orderedResourceIds: [], estimatedMinutes: 0,
      completionDefinition: "Summarize the evidence and unresolved questions", nextAction: "Generate an exploration set", completedResourceIds: [] },
    views: { reading: emptyView(), concept: emptyView(), evidence: emptyView() },
    resourceStates: {}, evidenceGraph: { claims: [], evidence: [], links: [], draftParagraphs: [] },
    createdAt: now, updatedAt: now,
  };
}

function decode(row: WorkbenchRow): WorkbenchState {
  const createdAt = new Date(row.createdAt).toISOString();
  const updatedAt = new Date(row.updatedAt).toISOString();
  try {
    return { ...(JSON.parse(row.stateJson) as WorkbenchState), ownerId: row.ownerId, sessionId: row.sessionId,
      version: row.version, createdAt, updatedAt };
  } catch {
    return { ...initialState(row.ownerId, row.sessionId, "Recover the workbench", createdAt),
      version: row.version, recoveryWarning: "CORRUPT_WORKBENCH", updatedAt };
  }
}

function persisted(state: WorkbenchState) {
  const safe = { ...state };
  delete safe.recoveryWarning;
  return JSON.stringify(safe);
}

export class PrismaWorkbenchStore implements WorkbenchStore {
  constructor(private readonly prisma: PrismaClient) {}
  async get(ownerId: string, sessionId: string) {
    const rows = await this.prisma.$queryRaw<WorkbenchRow[]>(Prisma.sql`
      SELECT "sessionId", "ownerId", "stateJson", "version", "createdAt", "updatedAt"
      FROM "ExplorationWorkbench" WHERE "ownerId" = ${ownerId} AND "sessionId" = ${sessionId} LIMIT 1
    `);
    return rows[0] ? decode(rows[0]) : null;
  }
  async createIfMissing(state: WorkbenchState) {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT OR IGNORE INTO "ExplorationWorkbench"
        ("sessionId", "ownerId", "stateJson", "version", "createdAt", "updatedAt")
      VALUES (${state.sessionId}, ${state.ownerId}, ${persisted(state)}, 0, ${new Date(state.createdAt)}, ${new Date(state.updatedAt)})
    `);
    const rows = await this.prisma.$queryRaw<WorkbenchRow[]>(Prisma.sql`
      SELECT "sessionId", "ownerId", "stateJson", "version", "createdAt", "updatedAt"
      FROM "ExplorationWorkbench" WHERE "sessionId" = ${state.sessionId} LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new ResearchError("SOURCE_FAILURE", "Exploration workbench persistence unavailable");
    if (row.ownerId !== state.ownerId) throw new ResearchError("NOT_FOUND", "Research session not found");
    return decode(row);
  }
  async update(ownerId: string, sessionId: string, expectedVersion: number, state: WorkbenchState) {
    const changed = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ExplorationWorkbench" SET "stateJson" = ${persisted(state)}, "version" = "version" + 1,
        "updatedAt" = ${new Date(state.updatedAt)}
      WHERE "ownerId" = ${ownerId} AND "sessionId" = ${sessionId} AND "version" = ${expectedVersion}
    `);
    if (changed === 1) return "updated" as const;
    return await this.get(ownerId, sessionId) ? "conflict" as const : "not_found" as const;
  }
}

export class InMemoryWorkbenchStore implements WorkbenchStore {
  private rows: WorkbenchState[] = [];
  async get(ownerId: string, sessionId: string) {
    return structuredClone(this.rows.find((item) => item.ownerId === ownerId && item.sessionId === sessionId) ?? null);
  }
  async createIfMissing(state: WorkbenchState) {
    const existing = this.rows.find((item) => item.sessionId === state.sessionId);
    if (existing && existing.ownerId !== state.ownerId) throw new ResearchError("NOT_FOUND", "Research session not found");
    if (existing) return structuredClone(existing);
    this.rows.push(structuredClone(state));
    return structuredClone(state);
  }
  async update(ownerId: string, sessionId: string, expectedVersion: number, state: WorkbenchState) {
    const index = this.rows.findIndex((item) => item.ownerId === ownerId && item.sessionId === sessionId);
    if (index < 0) return "not_found" as const;
    if (this.rows[index].version !== expectedVersion) return "conflict" as const;
    this.rows[index] = structuredClone({ ...state, version: expectedVersion + 1 });
    return "updated" as const;
  }
}

export class WorkbenchService {
  constructor(
    private readonly store: WorkbenchStore,
    private readonly research: ResearchSessionService,
    private readonly deps: { now: () => string } = { now: () => new Date().toISOString() },
  ) {}
  async get(ownerId: string, sessionId: string) {
    const session = await this.research.get(ownerId, sessionId);
    return await this.store.get(ownerId, sessionId)
      ?? this.store.createIfMissing(initialState(ownerId, sessionId, session.researchQuestion, this.deps.now()));
  }
  async update(ownerId: string, sessionId: string, input: WorkbenchUpdateInput) {
    await this.research.get(ownerId, sessionId);
    const current = await this.get(ownerId, sessionId);
    const evidenceErrors = validateEvidenceGraph(input.evidenceGraph);
    if (evidenceErrors.length) throw new ResearchError("BAD_REQUEST", evidenceErrors.join("; "));
    const next: WorkbenchState = { ...current, ...input, version: input.expectedVersion + 1, updatedAt: this.deps.now() };
    const result = await this.store.update(ownerId, sessionId, input.expectedVersion, next);
    if (result === "not_found") throw new ResearchError("NOT_FOUND", "Research session not found");
    if (result === "conflict") throw new ResearchError("CONFLICT", "Workbench changed in another tab");
    return next;
  }
}

const runtime = globalThis as unknown as { __workbenchService?: WorkbenchService };
export function getWorkbenchService() {
  if (!runtime.__workbenchService) {
    const store = process.env.VITEST === "true" || process.env.NODE_ENV === "test"
      ? new InMemoryWorkbenchStore() : new PrismaWorkbenchStore(getPrisma());
    runtime.__workbenchService = new WorkbenchService(store, getResearchSessionService());
  }
  return runtime.__workbenchService;
}
