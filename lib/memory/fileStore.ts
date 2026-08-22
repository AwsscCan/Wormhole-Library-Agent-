/**
 * FileStore — 跨路由共享 + 落盘持久化的 MemoryStore 实现。
 *
 * 之前的问题：feedback / search / memory / wormholes 四个 API route 各自
 * `new InMemoryStore()`，模块实例互相隔离 → 反馈写进 A 路由的内存，
 * search 路由（B 实例）永远看不到，重启全部丢失。
 *
 * 本模块以「模块级单例 + JSON 落盘」修复：
 * - 同一 Node 进程内所有 route 共享同一个实例（Next.js API route 满足此条件）
 * - 每次写入同步落盘到 <cwd>/.data/memory-store.json，重启不丢
 * - 接口与 MemoryStore 完全兼容，测试里仍可用 InMemoryStore
 */

import fs from "fs";
import path from "path";
import type {
  UserId,
  MemoryHistoryEntry,
  UserMemory,
} from "../types";
import type { MemoryStore } from "./getMemory";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "memory-store.json");

type DiskShape = {
  entries: Record<string, UserMemory[]>;
  history: Record<string, MemoryHistoryEntry[]>;
};

export class FileStore implements MemoryStore {
  private cache: DiskShape | null = null;

  private load(): DiskShape {
    if (this.cache) return this.cache;
    let db: DiskShape | null = null;
    try {
      if (fs.existsSync(STORE_FILE)) {
        db = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
      }
    } catch (e) {
      console.error("[FileStore] 读取失败，重建:", e);
      db = null;
    }
    this.cache = db ?? { entries: {}, history: {} };
    return this.cache;
  }

  private flush(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STORE_FILE, JSON.stringify(this.load(), null, 2));
    } catch (e) {
      console.error("[FileStore] 落盘失败:", e);
    }
  }

  async getEntries(userId: UserId): Promise<UserMemory[]> {
    return this.load().entries[userId] ?? [];
  }

  async getHistory(userId: UserId): Promise<MemoryHistoryEntry[]> {
    return this.load().history[userId] ?? [];
  }

  async saveEntry(entry: UserMemory): Promise<void> {
    const db = this.load();
    const list = db.entries[entry.userId] ?? [];
    // 同 key 覆盖（保留最新值与置信度），不同 key 追加
    const idx = list.findIndex((e) => e.key === entry.key);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...entry, useCount: list[idx].useCount + 1 };
    } else {
      list.push(entry);
    }
    db.entries[entry.userId] = list;
    this.flush();
  }

  async saveHistory(userId: UserId, entry: MemoryHistoryEntry): Promise<void> {
    const db = this.load();
    const list = db.history[userId] ?? [];
    list.push(entry);
    // 历史上限 200 条，防无限膨胀
    if (list.length > 200) db.history[userId] = list.slice(-200);
    else db.history[userId] = list;
    this.flush();
  }

  async reset(userId: UserId): Promise<void> {
    const db = this.load();
    db.entries[userId] = [];
    db.history[userId] = [];
    this.flush();
  }
}

/** 全局单例：所有 API route 必须从这里取 store，禁止各自 new */
const globalForStore = globalThis as unknown as { __paperwormStore?: FileStore };

export const sharedStore: MemoryStore =
  globalForStore.__paperwormStore ?? new FileStore();

// 开发模式热重载时挂到 globalThis 上保住实例
globalForStore.__paperwormStore = sharedStore as FileStore;
