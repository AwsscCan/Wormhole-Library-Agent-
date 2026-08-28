/**
 * Package 04 持久化与重启恢复（验收报告 F-005 / E-006）。
 *
 * - 把账本 / 索引 / 推断 / 撤销状态序列化为可落盘的快照，进程重启后恢复。
 * - 生产用 Prisma + SQLite（见 prisma/migrations/202608280001_package04_memory），
 *   测试用内存快照。
 * - 账本保持 append-only：快照只承载不可变事件，恢复时按唯一 ID 重建。
 */

import { getPrisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { rebuildIndexFromSnippets } from "./indexStore";
import type { InferredPreference, LearningEvent, MemorySnippet } from "./types";

export type MemorySnapshot = {
  events: LearningEvent[];
  snippets: MemorySnippet[];
  preferences: InferredPreference[];
  revoked: string[];
};

const KEYS = {
  ledger: "__package04LearningLedger",
  index: "__package04MemoryIndex",
  inference: "__package04Inference",
} as const;

type LedgerState = { events: LearningEvent[]; nextId: number };
type IndexEntry = { snippet: MemorySnippet; tokens: Set<string>; embedding: number[] };
type IndexState = { entries: Map<string, IndexEntry>; nextId: number };
type InferenceState = { preferences: Map<string, InferredPreference>; revoked: Set<string> };

function nextIdOf(events: { id: string }[]): number {
  let max = 0;
  for (const event of events) {
    const m = /^le-(\d+)$/.exec(event.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** 把当前进程内状态序列化为可落盘快照（纯值，无 Map/Set/引用）。 */
export function snapshotMemoryState(): MemorySnapshot {
  const g = globalThis as unknown as Record<string, unknown>;
  const ledger = (g[KEYS.ledger] ?? { events: [], nextId: 1 }) as LedgerState;
  const index = (g[KEYS.index] ?? { entries: new Map(), nextId: 1 }) as IndexState;
  const inference = (g[KEYS.inference] ?? { preferences: new Map(), revoked: new Set() }) as InferenceState;

  return {
    events: structuredClone(ledger.events),
    snippets: structuredClone([...index.entries.values()].map((entry) => entry.snippet)),
    preferences: structuredClone([...inference.preferences.values()]),
    revoked: [...inference.revoked],
  };
}

/** 用快照重建当前进程内状态（模拟新进程启动后的恢复）。 */
export function restoreMemoryState(snapshot: MemorySnapshot): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g[KEYS.ledger] = {
    events: structuredClone(snapshot.events),
    nextId: nextIdOf(snapshot.events),
  } satisfies LedgerState;
  rebuildIndexFromSnippets(structuredClone(snapshot.snippets));
  g[KEYS.inference] = {
    preferences: new Map(structuredClone(snapshot.preferences).map((p) => [p.id, p])),
    revoked: new Set(snapshot.revoked),
  } satisfies InferenceState;
}

/** 持久化存储接口：load 全量读取，save 全量写入（快照语义）。 */
export interface MemoryPersistenceStore {
  load(): Promise<MemorySnapshot | null>;
  save(snapshot: MemorySnapshot): Promise<void>;
}

export class InMemoryMemoryPersistenceStore implements MemoryPersistenceStore {
  private snapshot: MemorySnapshot | null = null;
  async load() { return this.snapshot; }
  async save(snapshot: MemorySnapshot) { this.snapshot = structuredClone(snapshot); }
}

/**
 * Prisma + SQLite 持久化（生产路径）。
 * 单行 JSON 快照存进 "MemorySnapshot" 表（迁移见 package04_memory）。
 */
export class SqliteMemoryPersistenceStore implements MemoryPersistenceStore {
  constructor(private readonly prisma: ReturnType<typeof getPrisma>) {}

  async load(): Promise<MemorySnapshot | null> {
    const rows = await this.prisma.$queryRaw<{ snapshotJson: string }[]>(Prisma.sql`
      SELECT "snapshotJson" FROM "MemorySnapshot" ORDER BY "updatedAt" DESC LIMIT 1
    `);
    if (!rows[0]) return null;
    try {
      return JSON.parse(rows[0].snapshotJson) as MemorySnapshot;
    } catch {
      return null;
    }
  }

  async save(snapshot: MemorySnapshot): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MemorySnapshot" ("id", "snapshotJson", "updatedAt")
      VALUES ('singleton', ${JSON.stringify(snapshot)}, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE SET
        "snapshotJson" = excluded."snapshotJson",
        "updatedAt" = CURRENT_TIMESTAMP
    `);
  }
}

const store = globalThis as unknown as { __package04MemoryPersistence?: MemoryPersistenceStore };

/** 测试用内存存储，生产用 SQLite 存储。 */
export function getMemoryPersistenceStore(): MemoryPersistenceStore {
  if (!store.__package04MemoryPersistence) {
    const useMemory = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
    store.__package04MemoryPersistence = useMemory
      ? new InMemoryMemoryPersistenceStore()
      : new SqliteMemoryPersistenceStore(getPrisma());
  }
  return store.__package04MemoryPersistence;
}

export function setMemoryPersistenceStoreForTests(next: MemoryPersistenceStore): void {
  store.__package04MemoryPersistence = next;
}

/** 落盘当前状态。 */
export async function persistMemoryState(): Promise<void> {
  await getMemoryPersistenceStore().save(snapshotMemoryState());
}

/** 从盘上恢复当前状态（有新快照则覆盖，无则保持现状）。 */
export async function loadMemoryState(): Promise<boolean> {
  const snapshot = await getMemoryPersistenceStore().load();
  if (!snapshot) return false;
  restoreMemoryState(snapshot);
  return true;
}
