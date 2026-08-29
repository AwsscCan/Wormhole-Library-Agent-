import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { CreateResearchSessionInput, GraphUpdateInput } from "./schemas";
import type { PersonalGraphState, ResearchSession, SessionSearch, SessionWormhole } from "./types";
import { ResearchError } from "./types";
import { forgetSession } from "./memory";

type Dependencies = { now: () => string; id: (prefix: string) => string };
type ResearchRow = {
  id: string; ownerId: string; researchQuestion: string; writingTopic: string | null;
  interactionIdsJson: string; evidenceIdsJson: string; searchesJson: string; wormholesJson: string;
  personalGraphJson: string; graphVersion: number; revision: number; createdAt: Date | string; updatedAt: Date | string;
};

export interface ResearchSessionStore {
  create(session: ResearchSession): Promise<void>;
  list(ownerId: string): Promise<ResearchSession[]>;
  get(ownerId: string, id: string): Promise<ResearchSession | null>;
  delete(ownerId: string, id: string): Promise<boolean>;
  replace(ownerId: string, expectedRevision: number, session: ResearchSession): Promise<boolean>;
  updateGraph(ownerId: string, id: string, expectedVersion: number, graph: PersonalGraphState, updatedAt: string): Promise<"updated" | "conflict" | "not_found">;
}

const emptyGraph = (): PersonalGraphState => ({ schemaVersion: 1, version: 0, nodeOverrides: {}, hiddenSystemEdgeIds: [], personalEdges: [] });
const parse = <T>(json: string, fallback: T): T => { try { return JSON.parse(json) as T; } catch { return fallback; } };

function decode(row: ResearchRow): ResearchSession {
  const createdAt = new Date(row.createdAt).toISOString();
  const updatedAt = new Date(row.updatedAt).toISOString();
  let graph: PersonalGraphState;
  let recoveryWarning: ResearchSession["recoveryWarning"];
  try { graph = JSON.parse(row.personalGraphJson) as PersonalGraphState; }
  catch { graph = emptyGraph(); recoveryWarning = "CORRUPT_PERSONAL_GRAPH"; }
  graph = { ...graph, version: row.graphVersion };
  return {
    id: row.id, ownerId: row.ownerId, researchQuestion: row.researchQuestion,
    writingTopic: row.writingTopic ?? undefined,
    interactionIds: parse(row.interactionIdsJson, []), evidenceIds: parse(row.evidenceIdsJson, []),
    searches: parse(row.searchesJson, []), wormholes: parse(row.wormholesJson, []),
    personalGraph: graph, revision: row.revision, recoveryWarning,
    createdAt, updatedAt,
  };
}

function encode(session: ResearchSession) {
  return {
    id: session.id, ownerId: session.ownerId, researchQuestion: session.researchQuestion,
    writingTopic: session.writingTopic ?? null,
    interactionIdsJson: JSON.stringify(session.interactionIds), evidenceIdsJson: JSON.stringify(session.evidenceIds),
    searchesJson: JSON.stringify(session.searches), wormholesJson: JSON.stringify(session.wormholes),
    personalGraphJson: JSON.stringify(session.personalGraph), graphVersion: session.personalGraph.version,
    revision: session.revision, createdAt: new Date(session.createdAt), updatedAt: new Date(session.updatedAt),
  };
}

export class PrismaResearchSessionStore implements ResearchSessionStore {
  constructor(private readonly prisma: PrismaClient) {}
  async create(session: ResearchSession) {
    await this.prisma.researchSession.create({ data: encode(session) });
  }
  async list(ownerId: string) {
    const rows = await this.prisma.researchSession.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } });
    return rows.map(decode);
  }
  async get(ownerId: string, id: string) {
    const row = await this.prisma.researchSession.findFirst({ where: { id, ownerId } });
    return row ? decode(row) : null;
  }
  async delete(ownerId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const owned = await tx.researchSession.findFirst({ where: { id, ownerId }, select: { id: true } });
      if (!owned) return false;
      await tx.writingCheckpoint.deleteMany({ where: { ownerId, sessionId: id } });
      await tx.writingArtifact.deleteMany({ where: { ownerId, sessionId: id } });
      await tx.writingEvidence.deleteMany({ where: { ownerId, sessionId: id } });
      await tx.explorationWorkbench.deleteMany({ where: { ownerId, sessionId: id } });
      await tx.researchSession.deleteMany({ where: { id, ownerId } });
      return true;
    });
  }
  async replace(ownerId: string, expectedRevision: number, session: ResearchSession) {
    const data = encode({ ...session, revision: expectedRevision + 1 });
    const changed = await this.prisma.researchSession.updateMany({
      where: { id: session.id, ownerId, revision: expectedRevision },
      data: {
        researchQuestion: data.researchQuestion, writingTopic: data.writingTopic,
        interactionIdsJson: data.interactionIdsJson, evidenceIdsJson: data.evidenceIdsJson,
        searchesJson: data.searchesJson, wormholesJson: data.wormholesJson,
        personalGraphJson: data.personalGraphJson, graphVersion: data.graphVersion,
        revision: { increment: 1 }, updatedAt: data.updatedAt,
      },
    });
    return changed.count === 1;
  }
  async updateGraph(ownerId: string, id: string, expectedVersion: number, graph: PersonalGraphState, updatedAt: string) {
    const changed = await this.prisma.researchSession.updateMany({
      where: { id, ownerId, graphVersion: expectedVersion },
      data: { personalGraphJson: JSON.stringify(graph), graphVersion: graph.version, revision: { increment: 1 }, updatedAt: new Date(updatedAt) },
    });
    if (changed.count === 1) return "updated" as const;
    return await this.get(ownerId, id) ? "conflict" as const : "not_found" as const;
  }
}

export class InMemoryResearchSessionStore implements ResearchSessionStore {
  private sessions: ResearchSession[] = [];
  async create(session: ResearchSession) { this.sessions.push(structuredClone(session)); }
  async list(ownerId: string) { return structuredClone(this.sessions.filter((item) => item.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); }
  async get(ownerId: string, id: string) { return structuredClone(this.sessions.find((item) => item.ownerId === ownerId && item.id === id) ?? null); }
  async delete(ownerId: string, id: string) {
    const index = this.sessions.findIndex((item) => item.ownerId === ownerId && item.id === id);
    if (index < 0) return false;
    this.sessions.splice(index, 1);
    return true;
  }
  async replace(ownerId: string, expectedRevision: number, session: ResearchSession) {
    const index = this.sessions.findIndex((item) => item.id === session.id && item.ownerId === ownerId && item.revision === expectedRevision);
    if (index < 0) return false;
    this.sessions[index] = structuredClone({ ...session, revision: expectedRevision + 1 }); return true;
  }
  async updateGraph(ownerId: string, id: string, expectedVersion: number, graph: PersonalGraphState, updatedAt: string) {
    const index = this.sessions.findIndex((item) => item.id === id && item.ownerId === ownerId);
    if (index < 0) return "not_found" as const;
    if (this.sessions[index].personalGraph.version !== expectedVersion) return "conflict" as const;
    this.sessions[index] = structuredClone({ ...this.sessions[index], personalGraph: graph, revision: this.sessions[index].revision + 1, updatedAt });
    return "updated" as const;
  }
}

const defaults: Dependencies = { now: () => new Date().toISOString(), id: (prefix) => `${prefix}-${crypto.randomUUID()}` };
export class ResearchSessionService {
  constructor(private readonly store: ResearchSessionStore, private readonly deps: Dependencies = defaults) {}
  async create(ownerId: string, input: CreateResearchSessionInput) {
    const now = this.deps.now();
    const session: ResearchSession = { id: this.deps.id("research"), ownerId, researchQuestion: input.researchQuestion,
      writingTopic: input.writingTopic, interactionIds: [], evidenceIds: [], searches: [], wormholes: [],
      personalGraph: emptyGraph(), revision: 0, createdAt: now, updatedAt: now };
    await this.store.create(session); return session;
  }
  async list(ownerId: string) { return this.store.list(ownerId); }
  async delete(ownerId: string, id: string) {
    await this.get(ownerId, id);
    await forgetSession(ownerId, id);
    if (!(await this.store.delete(ownerId, id))) throw new ResearchError("NOT_FOUND", "Research session not found");
  }
  async get(ownerId: string, id: string) {
    const session = await this.store.get(ownerId, id);
    if (!session) throw new ResearchError("NOT_FOUND", "Research session not found"); return session;
  }
  async getSearch(ownerId: string, id: string, interactionId: string) {
    const session = await this.get(ownerId, id);
    const search = session.searches.find((item) => item.interactionId === interactionId);
    if (!search) throw new ResearchError("NOT_FOUND", "Research search not found");
    return search;
  }
  async updateGraph(ownerId: string, id: string, input: GraphUpdateInput) {
    const graph: PersonalGraphState = { schemaVersion: 1, version: input.expectedVersion + 1, nodeOverrides: input.nodeOverrides, hiddenSystemEdgeIds: input.hiddenSystemEdgeIds, personalEdges: input.personalEdges };
    const result = await this.store.updateGraph(ownerId, id, input.expectedVersion, graph, this.deps.now());
    if (result === "not_found") throw new ResearchError("NOT_FOUND", "Research session not found");
    if (result === "conflict") throw new ResearchError("CONFLICT", "Graph changed in another tab; reload before saving");
    return this.get(ownerId, id);
  }
  async recordSearch(ownerId: string, id: string, search: SessionSearch) { return this.mutate(ownerId, id, (session) => ({ ...session, interactionIds: [...new Set([...session.interactionIds, search.interactionId])], searches: [...session.searches.filter((item) => item.interactionId !== search.interactionId), search].slice(-20), updatedAt: this.deps.now() })); }
  async recordLibrarySearch(ownerId: string, id: string, search: SessionSearch) { return this.mutate(ownerId, id, (session) => ({ ...session, searches: [...session.searches.filter((item) => item.interactionId !== search.interactionId), search].slice(-20), updatedAt: this.deps.now() })); }
  async addEvidence(ownerId: string, id: string, resourceId: string) { return this.mutate(ownerId, id, (session) => ({ ...session, evidenceIds: [...new Set([...session.evidenceIds, resourceId])], updatedAt: this.deps.now() })); }
  async recordWormholes(ownerId: string, id: string, wormholes: SessionWormhole[]) { return this.mutate(ownerId, id, (session) => ({ ...session, wormholes, updatedAt: this.deps.now() })); }
  async recordActivity(ownerId: string, id: string, input: { kind: "upload" | "writing"; title: string; resourceId?: string }) {
    const title = input.title.trim().slice(0, 300);
    if (!title) return this.get(ownerId, id);
    const concepts = [...new Set(title.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1))].slice(0, 8)
      .map((word) => ({ id: `activity:${word}`, name: word, domain: input.kind === "upload" ? "private-material" : "writing" }));
    const interactionId = `${input.kind}-${this.deps.id("activity")}`;
    const resourceId = input.resourceId ?? `${input.kind}:${encodeURIComponent(title)}`;
    return this.mutate(ownerId, id, (session) => ({ ...session,
      interactionIds: [...new Set([...session.interactionIds, interactionId])],
      searches: [...session.searches, { interactionId, query: title, at: this.deps.now(), concepts, resources: [{ id: resourceId, title, concepts, sourceLabel: input.kind === "upload" ? "私有知识库" : "写作产物" }] }].slice(-20),
      updatedAt: this.deps.now(),
    }));
  }
  private async mutate(ownerId: string, id: string, update: (session: ResearchSession) => ResearchSession) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const session = await this.get(ownerId, id); const next = update(session);
      if (await this.store.replace(ownerId, session.revision, next)) return { ...next, revision: session.revision + 1 };
    }
    throw new ResearchError("CONFLICT", "Session changed concurrently; retry the operation");
  }
}

const globalStore = globalThis as unknown as { __researchSessionService?: ResearchSessionService };
export function getResearchSessionService() {
  if (!globalStore.__researchSessionService) {
    const store = process.env.VITEST === "true" || process.env.NODE_ENV === "test" ? new InMemoryResearchSessionStore() : new PrismaResearchSessionStore(getPrisma());
    globalStore.__researchSessionService = new ResearchSessionService(store);
  }
  return globalStore.__researchSessionService;
}

export function clearResearchSessionServiceForTests() {
  delete globalStore.__researchSessionService;
}
