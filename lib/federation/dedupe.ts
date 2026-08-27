/**
 * 跨源去重引擎（v3.2 package 02 / M2）
 *
 * 两层策略（用户拍板的"精确键 + 标题归一化"方案）：
 *  1. 精确键：DOI / ISBN 归一化后完全相等才合并（零误判）
 *  2. 标题回退：标题归一化（去标点/小写/排序 token）完全相同
 *     + 首作者姓相同 + 年份差 ≤1 才合并
 *
 * 纯函数、零依赖、零网络。合并结果带 DedupeReport，供去重质量实验直接引用。
 */

import type { EvidenceItem, SourceRef } from "./types";

/** 去重输入：一个来源吐出的一条候选记录（尚未合并） */
export interface DedupeCandidate {
  title: string;
  authors: readonly string[];
  year: number | null;
  doi?: string;
  isbn?: string;
  excerpt?: string;
  url?: string;
  source: SourceRef;
}

/** 去重质量实验用的报告（哪些条目被吸并进谁） */
export interface DedupeReport {
  inputCount: number;
  outputCount: number;
  /** 被合并掉的候选数 = inputCount - outputCount */
  mergedCount: number;
  /** 每次 keep<-absorbed 的明细，长度 = 合并次数 */
  merges: ReadonlyArray<{ keptId: string; absorbedIds: readonly string[] }>;
}

export interface DedupeOutcome {
  items: readonly EvidenceItem[];
  report: DedupeReport;
}

/** 标题归一化：小写 → 去标点 → 压空白 → token 排序（语序无关） */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** ISBN 归一化：去连字符/空格，统一大写（ISBN-10 校验位 x） */
export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s]/g, "").toUpperCase();
}

/** DOI 归一化：小写、剥掉 https://doi.org/ 与 doi: 前缀 */
export function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "");
}

/**
 * 首作者姓："Smith, John" → "smith"；"John Smith" → "smith"；"John van der Berg" → "berg"。
 * 无作者返回空串（空串与空串在标题层视为相等——只有标题也完全一致才合并）。
 */
export function firstAuthorSurname(authors: readonly string[]): string {
  const first = authors[0]?.trim();
  if (!first) return "";
  const comma = first.split(",")[0]?.trim();
  if (comma && first.includes(",")) return comma.toLowerCase();
  const tokens = first.split(/\s+/).filter(Boolean);
  return (tokens[tokens.length - 1] ?? "").toLowerCase();
}

/** FNV-1a 32 位 hash —— 稳定 ID 用，不引入 crypto 依赖 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** 稳定 ID：DOI 优先，其次 ISBN，最后 标题hash+作者（跨检索/跨源不变） */
export function createStableId(input: {
  doi?: string;
  isbn?: string;
  title: string;
  authors: readonly string[];
}): string {
  if (input.doi) return `doi:${normalizeDoi(input.doi)}`;
  if (input.isbn) return `isbn:${normalizeIsbn(input.isbn)}`;
  return `title:${fnv1a(`${normalizeTitle(input.title)}|${firstAuthorSurname(input.authors)}`)}`;
}

/** 源优先级：真实学术源 > 书目源 > 本地种子（合并时决定保留谁的元数据） */
const SOURCE_PRIORITY: Record<string, number> = {
  openalex: 0,
  openlibrary: 1,
  seed: 2,
  user: 3,
};

function candidatePriority(c: DedupeCandidate): number {
  return SOURCE_PRIORITY[c.source.kind] ?? 9;
}

/** 年份可合并判定：两侧都有年份时差 ≤1；任一侧缺年份视为可合并（标题层已是全等） */
function yearsMergeable(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return true;
  return Math.abs(a - b) <= 1;
}

/** 标题层合并键：归一化标题 + 首作者姓 */
function titleKey(c: DedupeCandidate): string {
  return `${normalizeTitle(c.title)}|${firstAuthorSurname(c.authors)}`;
}

/** 把一组候选合并成一条 EvidenceItem（组内已确认同源作品） */
function mergeGroup(group: readonly DedupeCandidate[]): EvidenceItem {
  const sorted = [...group].sort(
    (a, b) => candidatePriority(a) - candidatePriority(b),
  );
  const primary = sorted[0];
  const sources = sorted.map((c) => c.source);
  const bestYear = sorted.find((c) => c.year !== null)?.year ?? null;
  const bestExcerpt =
    sorted.find((c) => c.excerpt && c.excerpt.length > 0)?.excerpt ?? undefined;
  const url = sorted.find((c) => c.url)?.url ?? undefined;
  return {
    id: createStableId(primary),
    title: primary.title,
    authors: primary.authors,
    year: bestYear,
    excerpt: bestExcerpt,
    sources,
    retrievedAt: Math.max(...sorted.map((c) => c.source.retrievedAt)),
    doi: sorted.find((c) => c.doi)?.doi,
    isbn: sorted.find((c) => c.isbn)?.isbn,
    url,
  };
}

/**
 * 主入口：候选列表 → 去重合并后的证据条目 + 报告。
 *
 * 两轮分组：
 *  1. 精确键（DOI/ISBN 归一化后全等）
 *  2. 标题层（归一化标题+首作者姓全等，且组内年份两两可合并）——
 *     无精确键的候选才进入这轮，避免精确键组被标题层二次打散
 */
export function dedupeCandidates(
  candidates: readonly DedupeCandidate[],
): DedupeOutcome {
  const byExact = new Map<string, DedupeCandidate[]>();
  const leftover: DedupeCandidate[] = [];

  // 第一轮：精确键
  for (const c of candidates) {
    let key: string | null = null;
    if (c.doi) key = `doi:${normalizeDoi(c.doi)}`;
    else if (c.isbn) key = `isbn:${normalizeIsbn(c.isbn)}`;
    if (key) {
      const bucket = byExact.get(key);
      if (bucket) bucket.push(c);
      else byExact.set(key, [c]);
    } else {
      leftover.push(c);
    }
  }

  // 第二轮：标题层（只在无精确键的候选之间）
  const byTitle = new Map<string, DedupeCandidate[]>();
  for (const c of leftover) {
    const key = titleKey(c);
    const bucket = byTitle.get(key);
    if (bucket) {
      // 年份约束：新成员必须与组内每个已有成员年份差 ≤1
      if (bucket.every((existing) => yearsMergeable(existing.year, c.year))) {
        bucket.push(c);
      } else {
        // 年份不合 → 同标题但不同版次（如 1998 初版 vs 2020 二版），独立成组
        byTitle.set(`${key}#${c.year ?? "ny"}`, [c]);
      }
    } else {
      byTitle.set(key, [c]);
    }
  }

  const groups = [...byExact.values(), ...byTitle.values()];
  const items = groups.map(mergeGroup);

  const merges = groups
    .filter((g) => g.length > 1)
    .map((g) => {
      const sorted = [...g].sort(
        (a, b) => candidatePriority(a) - candidatePriority(b),
      );
      return {
        keptId: createStableId(sorted[0]),
        absorbedIds: sorted.slice(1).map((c) => createStableId(c)),
      };
    });

  return {
    items,
    report: {
      inputCount: candidates.length,
      outputCount: items.length,
      mergedCount: candidates.length - items.length,
      merges,
    },
  };
}
