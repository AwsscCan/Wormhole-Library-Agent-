/**
 * Get Memory Module
 *
 * Reads user preferences from storage (Prisma/SQLite) and returns
 * a structured MemorySnapshot.
 *
 * Design doc 9.3: UserMemory model in Prisma
 * Design doc 24: demo-user has 3 initial memories
 *
 * This module provides:
 * - getMemory(userId): reads from DB, returns snapshot
 * - getMemoryHistory(userId): reads update history
 * - getDefaultMemory(): returns the seed/default memory
 *
 * NOTE: The DB layer is abstracted via a MemoryStore interface so
 * this module works with OR without Prisma. When Prisma is not
 * available (e.g., in tests), it falls back to in-memory storage.
 */

import type {
  UserId,
  MemorySnapshot,
  MemoryHistoryEntry,
  UserMemory,
} from "../types";

/**
 * Abstract storage interface.
 * The main repo's Prisma-based implementation should satisfy this.
 */
export interface MemoryStore {
  getEntries(userId: UserId): Promise<UserMemory[]>;
  getHistory(userId: UserId): Promise<MemoryHistoryEntry[]>;
  saveEntry(entry: UserMemory): Promise<void>;
  saveHistory(userId: UserId, entry: MemoryHistoryEntry): Promise<void>;
  reset(userId: UserId): Promise<void>;
}

/**
 * In-memory store for testing and fallback.
 */
export class InMemoryStore implements MemoryStore {
  private entries = new Map<string, UserMemory[]>();
  private history = new Map<string, MemoryHistoryEntry[]>();

  async getEntries(userId: UserId): Promise<UserMemory[]> {
    return this.entries.get(userId) ?? [];
  }

  async getHistory(userId: UserId): Promise<MemoryHistoryEntry[]> {
    return this.history.get(userId) ?? [];
  }

  async saveEntry(entry: UserMemory): Promise<void> {
    const existing = this.entries.get(entry.userId) ?? [];
    existing.push(entry);
    this.entries.set(entry.userId, existing);
  }

  async saveHistory(userId: UserId, entry: MemoryHistoryEntry): Promise<void> {
    const existing = this.history.get(userId) ?? [];
    existing.push(entry);
    this.history.set(userId, existing);
  }

  async reset(userId: UserId): Promise<void> {
    this.entries.set(userId, []);
    this.history.set(userId, []);
  }
}

/**
 * Default (seed) memory for a brand-new user.
 * Design doc 24: demo-user has 3 seeded memories (prefer empirical,
 * Chinese-first, mathTolerance=0.5) — those live in the DB seed for the
 * demo persona, NOT in this default. A new user starts neutral:
 * preferences (prefEmpirical, theoryTolerance) are only set after the
 * user gives feedback, which is what makes the feedback → memory →
 * ranking loop observable from a clean slate.
 */
export function getDefaultMemory(): MemorySnapshot {
  return {
    reading: {
      languagePref: "zh_first",
      summaryFirst: true,
      resultCount: 5,
      prefEmpirical: false,
    },
    difficulty: {
      preferredLevel: "undergrad",
      mathTolerance: 0.5,
      theoryTolerance: 1.0,
    },
    citation: {
      defaultStyle: "apa",
    },
    serendipity: {
      defaultSlider: 60,
      likedDomains: [],
      dislikedDomains: [],
    },
  };
}

/**
 * Build a MemorySnapshot from raw UserMemory entries.
 */
function buildSnapshot(entries: UserMemory[]): MemorySnapshot {
  const snapshot = getDefaultMemory();

  for (const entry of entries) {
    const [category, key] = entry.key.split(".");
    switch (category) {
      case "reading":
        (snapshot.reading as Record<string, unknown>)[key] = entry.value;
        break;
      case "difficulty":
        (snapshot.difficulty as Record<string, unknown>)[key] = entry.value;
        break;
      case "citation":
        (snapshot.citation as Record<string, unknown>)[key] = entry.value;
        break;
      case "serendipity":
        if (key === "likedDomains" || key === "dislikedDomains") {
          const existing = (snapshot.serendipity as Record<string, unknown>)[key] as string[];
          // entry.value 可能是单个字符串，也可能是整个数组（保存最终值时）
          const incoming = Array.isArray(entry.value)
            ? (entry.value as string[])
            : [entry.value as string];
          for (const v of incoming) {
            if (v && !existing.includes(v)) {
              existing.push(v);
            }
          }
          (snapshot.serendipity as Record<string, unknown>)[key] = existing;
        } else {
          (snapshot.serendipity as Record<string, unknown>)[key] = entry.value;
        }
        break;
    }
  }

  return snapshot;
}

/**
 * Get a user's memory snapshot.
 * Falls back to default memory if user has no stored entries.
 */
export async function getMemory(
  userId: UserId,
  store?: MemoryStore
): Promise<{ memory: MemorySnapshot; source: "db" | "default" }> {
  if (!store) {
    return { memory: getDefaultMemory(), source: "default" };
  }

  const entries = await store.getEntries(userId);
  if (entries.length === 0) {
    return { memory: getDefaultMemory(), source: "default" };
  }

  return { memory: buildSnapshot(entries), source: "db" };
}

/**
 * Get a user's memory update history.
 */
export async function getMemoryHistory(
  userId: UserId,
  store?: MemoryStore
): Promise<MemoryHistoryEntry[]> {
  if (!store) return [];
  return store.getHistory(userId);
}

/**
 * Reset a user's memory to default.
 */
export async function resetMemory(
  userId: UserId,
  store?: MemoryStore
): Promise<void> {
  if (!store) return;
  await store.reset(userId);
}

/**
 * Persist a full memory snapshot to the store（03-03 补交）.
 *
 * 写入策略：先 reset，再为快照的每个叶子键写一条 UserMemory 条目，
 * 值为最终值 —— 因此经 buildSnapshot() 重建的结果与快照完全一致
 * （确定性往返）。主仓库的 Prisma 实现可直接替换该存储。
 */
export async function saveSnapshot(
  store: MemoryStore,
  userId: UserId,
  snapshot: MemorySnapshot
): Promise<void> {
  await store.reset(userId);
  const now = new Date().toISOString();
  const mk = (
    category: UserMemory["category"],
    key: string,
    value: unknown
  ): UserMemory => ({
    userId,
    category,
    key,
    value,
    confidence: 0.8,
    source: "explicit_feedback",
    useCount: 1,
    updatedAt: now,
  });

  const entries: UserMemory[] = [
    mk("reading", "reading.languagePref", snapshot.reading.languagePref),
    mk("reading", "reading.summaryFirst", snapshot.reading.summaryFirst),
    mk("reading", "reading.resultCount", snapshot.reading.resultCount),
    mk("difficulty", "difficulty.preferredLevel", snapshot.difficulty.preferredLevel),
    mk("difficulty", "difficulty.mathTolerance", snapshot.difficulty.mathTolerance),
    mk("serendipity", "serendipity.defaultSlider", snapshot.serendipity.defaultSlider),
    mk("serendipity", "serendipity.likedDomains", [...snapshot.serendipity.likedDomains]),
    mk("serendipity", "serendipity.dislikedDomains", [...snapshot.serendipity.dislikedDomains]),
  ];

  if (snapshot.reading.prefEmpirical !== undefined) {
    entries.push(mk("reading", "reading.prefEmpirical", snapshot.reading.prefEmpirical));
  }
  if (snapshot.reading.prefTheoretical !== undefined) {
    entries.push(mk("reading", "reading.prefTheoretical", snapshot.reading.prefTheoretical));
  }
  if (snapshot.difficulty.theoryTolerance !== undefined) {
    entries.push(
      mk("difficulty", "difficulty.theoryTolerance", snapshot.difficulty.theoryTolerance)
    );
  }
  if (snapshot.citation?.defaultStyle !== undefined) {
    entries.push(mk("citation", "citation.defaultStyle", snapshot.citation.defaultStyle));
  }

  for (const entry of entries) {
    await store.saveEntry(entry);
  }
}
