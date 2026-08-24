import fs from "node:fs";
import path from "node:path";
import type { CreateResearchSessionInput, GraphUpdateInput } from "./schemas";
import type { PersonalGraphState, ResearchSession, SessionSearch, SessionWormhole } from "./types";
import { ResearchError } from "./types";

type DiskState = { schemaVersion: 1; sessions: ResearchSession[] };
type Dependencies = { now: () => string; id: (prefix: string) => string };

export interface ResearchSessionStore {
  readAll(): Promise<ResearchSession[]>;
  writeAll(sessions: ResearchSession[]): Promise<void>;
}

export class FileResearchSessionStore implements ResearchSessionStore {
  constructor(private readonly file = path.join(process.cwd(), ".data", "research-sessions.json")) {}

  async readAll(): Promise<ResearchSession[]> {
    if (!fs.existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as DiskState;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.sessions)) throw new Error("unsupported research store");
      return parsed.sessions;
    } catch {
      const corrupt = `${this.file}.corrupt`;
      if (fs.existsSync(corrupt)) fs.rmSync(corrupt);
      fs.renameSync(this.file, corrupt);
      return [];
    }
  }

  async writeAll(sessions: ResearchSession[]): Promise<void> {
    const directory = path.dirname(this.file);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, sessions } satisfies DiskState, null, 2), "utf8");
    fs.renameSync(temporary, this.file);
  }
}

export class InMemoryResearchSessionStore implements ResearchSessionStore {
  private sessions: ResearchSession[] = [];
  async readAll() { return structuredClone(this.sessions); }
  async writeAll(sessions: ResearchSession[]) { this.sessions = structuredClone(sessions); }
}

const defaults: Dependencies = {
  now: () => new Date().toISOString(),
  id: (prefix) => `${prefix}-${crypto.randomUUID()}`,
};

export class ResearchSessionService {
  constructor(private readonly store: ResearchSessionStore, private readonly deps: Dependencies = defaults) {}

  async create(ownerId: string, input: CreateResearchSessionInput): Promise<ResearchSession> {
    const now = this.deps.now();
    const session: ResearchSession = {
      id: this.deps.id("research"), ownerId, researchQuestion: input.researchQuestion,
      writingTopic: input.writingTopic, interactionIds: [], evidenceIds: [], searches: [], wormholes: [],
      personalGraph: { schemaVersion: 1, version: 0, nodeOverrides: {}, hiddenSystemEdgeIds: [], personalEdges: [] },
      createdAt: now, updatedAt: now,
    };
    const sessions = await this.store.readAll();
    sessions.push(session);
    await this.store.writeAll(sessions);
    return session;
  }

  async list(ownerId: string): Promise<ResearchSession[]> {
    return (await this.store.readAll()).filter((session) => session.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(ownerId: string, id: string): Promise<ResearchSession> {
    const session = (await this.store.readAll()).find((item) => item.id === id && item.ownerId === ownerId);
    if (!session) throw new ResearchError("NOT_FOUND", "Research session not found");
    return session;
  }

  async updateGraph(ownerId: string, id: string, input: GraphUpdateInput): Promise<ResearchSession> {
    return this.mutate(ownerId, id, (session) => {
      if (session.personalGraph.version !== input.expectedVersion) throw new ResearchError("CONFLICT", "Graph changed in another tab; reload before saving");
      const personalGraph: PersonalGraphState = {
        schemaVersion: 1, version: session.personalGraph.version + 1,
        nodeOverrides: input.nodeOverrides, hiddenSystemEdgeIds: input.hiddenSystemEdgeIds,
        personalEdges: input.personalEdges,
      };
      return { ...session, personalGraph, updatedAt: this.deps.now() };
    });
  }

  async recordSearch(ownerId: string, id: string, search: SessionSearch): Promise<ResearchSession> {
    return this.mutate(ownerId, id, (session) => ({
      ...session,
      interactionIds: [...new Set([...session.interactionIds, search.interactionId])],
      searches: [...session.searches.filter((item) => item.interactionId !== search.interactionId), search].slice(-20),
      updatedAt: this.deps.now(),
    }));
  }

  async addEvidence(ownerId: string, id: string, resourceId: string): Promise<ResearchSession> {
    return this.mutate(ownerId, id, (session) => ({ ...session, evidenceIds: [...new Set([...session.evidenceIds, resourceId])], updatedAt: this.deps.now() }));
  }

  async recordWormholes(ownerId: string, id: string, wormholes: SessionWormhole[]): Promise<ResearchSession> {
    return this.mutate(ownerId, id, (session) => ({ ...session, wormholes, updatedAt: this.deps.now() }));
  }

  private async mutate(ownerId: string, id: string, update: (session: ResearchSession) => ResearchSession) {
    const sessions = await this.store.readAll();
    const index = sessions.findIndex((session) => session.id === id && session.ownerId === ownerId);
    if (index < 0) throw new ResearchError("NOT_FOUND", "Research session not found");
    const next = update(sessions[index]);
    sessions[index] = next;
    await this.store.writeAll(sessions);
    return next;
  }
}

const globalStore = globalThis as unknown as { __researchSessionService?: ResearchSessionService };
export function getResearchSessionService() {
  if (!globalStore.__researchSessionService) {
    const store = process.env.VITEST === "true" || process.env.NODE_ENV === "test"
      ? new InMemoryResearchSessionStore()
      : new FileResearchSessionStore();
    globalStore.__researchSessionService = new ResearchSessionService(store);
  }
  return globalStore.__researchSessionService;
}
