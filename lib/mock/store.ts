/**
 * In-memory demo store（队友01）
 * 作用：在 Prisma/队友模块接入之前，让整条链路先跑通。
 * 接入真实模块后，orchestrator 会优先用真实实现，这里只做 fallback。
 */
import type {
  MemorySummary,
  MemoryUpdateEvent,
  SearchResponse,
  WormholeCard,
} from "@/lib/types";

export interface StoredInteraction {
  id: string;
  userId: string;
  query: string;
  sliderValue: number;
  conceptIds: string[];
  searchResponse: SearchResponse;
  /** 最近一次为该 interaction 生成的虫洞（feedback 编译时要用） */
  wormholes?: WormholeCard[];
  createdAt: string;
}

interface DemoStore {
  interactions: Map<string, StoredInteraction>;
  memories: Map<string, MemorySummary>;
  memoryEvents: Map<string, MemoryUpdateEvent[]>;
  counter: number;
}

export function defaultMemory(): MemorySummary {
  return {
    reading: {
      language: "zh_first",
      resourceTypeOrder: ["book", "paper", "course", "thesis"],
      summaryFirst: true,
      maxResults: 6,
    },
    difficulty: {
      preferredLevel: "undergrad",
      mathTolerance: 0.5,
      paperDensity: 0.4,
    },
    serendipity: {
      defaultSlider: 50,
      noveltyMean: 0.5,
      noveltyStd: 0.15,
      likedDomains: [],
      dislikedDomains: [],
    },
    social: {
      matchingMode: "ask_first",
      anonymousFirst: true,
      livingBookOptIn: false,
    },
  };
}

// globalThis 缓存：避免 Next dev 热重载丢状态
const g = globalThis as unknown as { __wormholeDemoStore?: DemoStore };

export function getStore(): DemoStore {
  if (!g.__wormholeDemoStore) {
    g.__wormholeDemoStore = {
      interactions: new Map(),
      memories: new Map(),
      memoryEvents: new Map(),
      counter: 0,
    };
  }
  return g.__wormholeDemoStore;
}

export function nextId(prefix: string): string {
  const store = getStore();
  store.counter += 1;
  return `${prefix}_${String(store.counter).padStart(3, "0")}`;
}

export function getMemory(userId: string): MemorySummary {
  const store = getStore();
  if (!store.memories.has(userId)) {
    store.memories.set(userId, defaultMemory());
  }
  return store.memories.get(userId)!;
}

export function getMemoryEvents(userId: string): MemoryUpdateEvent[] {
  const store = getStore();
  return store.memoryEvents.get(userId) ?? [];
}

export function pushMemoryEvent(userId: string, event: MemoryUpdateEvent): void {
  const store = getStore();
  const events = store.memoryEvents.get(userId) ?? [];
  events.unshift(event);
  store.memoryEvents.set(userId, events.slice(0, 20));
}

export function resetMemory(userId: string): MemorySummary {
  const store = getStore();
  const fresh = defaultMemory();
  store.memories.set(userId, fresh);
  store.memoryEvents.set(userId, []);
  return fresh;
}
