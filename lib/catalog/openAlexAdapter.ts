/**
 * OpenAlex 馆藏适配器（责任包03 扩展）
 *
 * 用 OpenAlex API（免费、无 Key、国内可直连）做真实论文搜索，
 * 映射成团队统一的 ResourceCard。任何失败（网络/超时/解析/开关）
 * 都静默回退到 seedCatalogAdapter，保证 demo 永不空屏。
 *
 * 环境开关：
 *  - OPENALEX_DISABLED=1  强制走 seed（测试/离线演示用）
 *  - OPENALEX_TIMEOUT_MS  请求超时（默认 6000ms）
 */
import type {
  Availability,
  CatalogAdapter,
  ConceptRef,
  Difficulty,
  Language,
  LanguagePref,
  ResourceCard,
  ResourceType,
} from "@/lib/types";
import { loadConceptGraph } from "@/lib/concepts/graph";
import { seedCatalogAdapter } from "./seedCatalogAdapter";

const OPENALEX_BASE = "https://api.openalex.org/works";
const POLITE_MAILTO = "wormhole-library-agent@example.com"; // OpenAlex polite pool
const DEFAULT_TIMEOUT_MS = 6000;

/** OpenAlex works 返回结构（只取用到的字段） */
interface OpenAlexWork {
  id: string;
  doi?: string | null;
  display_name: string;
  publication_year?: number | null;
  cited_by_count?: number;
  language?: string;
  open_access?: { is_oa?: boolean };
  primary_location?: {
    source?: { display_name?: string } | null;
    landing_page_url?: string;
  } | null;
  authorships?: { author?: { display_name?: string } }[];
  concepts?: { id: string; display_name: string; score?: number }[];
  abstract_inverted_index?: Record<string, number[]> | null;
}

// ---------- 概念映射：OpenAlex concept 名 → 本地概念图 ----------

let localConceptByName: Map<string, ConceptRef> | null = null;

function getLocalConceptByName(): Map<string, ConceptRef> {
  if (localConceptByName) return localConceptByName;
  const graph = loadConceptGraph();
  const map = new Map<string, ConceptRef>();
  for (const node of graph.nodes.values()) {
    const key = node.name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { id: node.id, name: node.name, domain: node.domain });
    }
  }
  localConceptByName = map;
  return map;
}

/** OpenAlex 概念名映射到本地概念图；命中返回 ConceptRef，未命中返回 null */
function mapOpenAlexConcept(displayName: string): ConceptRef | null {
  const table = getLocalConceptByName();
  const key = displayName.toLowerCase();
  // 1) 精确名匹配
  const exact = table.get(key);
  if (exact) return exact;
  // 2) 单向包含匹配（OpenAlex "Attention mechanism" ⊃ 本地 "Attention"）
  for (const [name, ref] of table) {
    if (key.includes(name) || name.includes(key)) {
      if (name.length >= 4 && key.length >= 4) return ref;
    }
  }
  return null;
}

// ---------- 字段映射 ----------

function reconstructAbstract(w: OpenAlexWork, maxLen = 220): string | undefined {
  const inv = w.abstract_inverted_index;
  if (!inv || typeof inv !== "object") return undefined;
  const words: string[] = [];
  const positions = new Map<number, string>();
  for (const [word, idxs] of Object.entries(inv)) {
    for (const i of idxs ?? []) positions.set(i, word);
  }
  const max = Math.max(-1, ...positions.keys());
  for (let i = 0; i <= max; i++) {
    const word = positions.get(i);
    if (word) words.push(word);
  }
  const text = words.join(" ").trim();
  if (!text) return undefined;
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function containsCJK(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

/** 概念覆盖度 + 引用数 → 难度估计（保守启发式） */
function estimateDifficulty(matchedConcepts: ConceptRef[], mathHeavy: boolean): Difficulty {
  if (mathHeavy) return "research";
  if (matchedConcepts.length >= 5) return "graduate";
  return "undergrad";
}

const MATH_HINTS = [
  "mathematics", "statistics", "statistical", "probability", "optimization",
  "theorem", "algebra", "calculus", "information theory", "physics",
];

function toResourceCard(w: OpenAlexWork, query: string): ResourceCard | null {
  if (!w.display_name || !w.id) return null;
  const matched: ConceptRef[] = [];
  const seen = new Set<string>();
  let mathHeavy = false;
  for (const c of (w.concepts ?? []).slice(0, 24)) {
    const lower = c.display_name?.toLowerCase() ?? "";
    if (MATH_HINTS.some((h) => lower.includes(h))) mathHeavy = true;
    const local = c.display_name ? mapOpenAlexConcept(c.display_name) : null;
    if (local && !seen.has(local.id)) {
      seen.add(local.id);
      matched.push(local);
    }
    if (matched.length >= 6) break;
  }

  const authors = (w.authorships ?? [])
    .map((a) => a.author?.display_name ?? "")
    .filter(Boolean)
    .slice(0, 6);

  const cited = w.cited_by_count ?? 0;
  // 引用数对数归一：0 引 → 0.3 起步，1000+ 引 → 接近 1
  const qualityScore = Math.min(1, 0.3 + Math.log10(1 + cited) / 4);

  const isOA = w.open_access?.is_oa === true;
  const availability: Availability = isOA ? "online" : "unknown";

  const venue = w.primary_location?.source?.display_name;
  const url = w.primary_location?.landing_page_url ?? w.doi ?? `https://doi.org/${w.id}`;

  const conceptNames = matched.map((c) => c.name).slice(0, 3).join("、");
  const abstract = reconstructAbstract(w);
  const why =
    `OpenAlex 检索命中「${query}」` +
    (conceptNames ? `，关联概念：${conceptNames}` : "") +
    `，被引 ${cited} 次` +
    (abstract ? `。${abstract}` : "");

  return {
    id: w.id.replace("https://openalex.org/", "oa:"),
    type: "paper" as ResourceType,
    title: w.display_name,
    authors: authors.length ? authors : ["Unknown"],
    year: w.publication_year ?? undefined,
    language: (containsCJK(w.display_name) ? "zh" : "en") as Language,
    why,
    location: venue,
    availability,
    difficulty: estimateDifficulty(matched, mathHeavy),
    concepts: matched,
    qualityScore: Number(qualityScore.toFixed(2)),
    sourceUrl: url,
  };
}

// ---------- 适配器实现 ----------

function isOpenAlexDisabled(): boolean {
  return process.env.OPENALEX_DISABLED === "1";
}

async function fetchWorks(query: string, limit: number): Promise<OpenAlexWork[]> {
  const timeoutMs = Number(process.env.OPENALEX_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url =
      `${OPENALEX_BASE}?search=${encodeURIComponent(query)}` +
      `&per-page=${Math.min(25, Math.max(1, limit))}` +
      `&mailto=${encodeURIComponent(POLITE_MAILTO)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
    const data = (await res.json()) as { results?: OpenAlexWork[] };
    return data.results ?? [];
  } finally {
    clearTimeout(timer);
  }
}

export const openAlexAdapter: CatalogAdapter = {
  async searchCatalog(input): Promise<ResourceCard[]> {
    if (isOpenAlexDisabled() || !input.query.trim()) {
      return seedCatalogAdapter.searchCatalog(input);
    }
    try {
      const limit = input.limit ?? 8;
      const works = await fetchWorks(input.query, limit);
      // 概念过滤：概念图命中的论文优先；没命中的只要标题相关也保留（尾部）
      const cards = works
        .map((w) => toResourceCard(w, input.query))
        .filter((c): c is ResourceCard => c !== null);
      const withConcepts = cards.filter((c) => c.concepts.length > 0);
      const without = cards.filter((c) => c.concepts.length === 0);
      const ranked = [...withConcepts, ...without].slice(0, limit);
      if (ranked.length === 0) throw new Error("OpenAlex empty result");
      return ranked;
    } catch {
      // 网络/超时/解析失败 → 静默回退 seed（demo 永不空屏）
      return seedCatalogAdapter.searchCatalog(input);
    }
  },

  async getResourceDetails(resourceId: string): Promise<ResourceCard | null> {
    // 详情查询委托 seed（OpenAlex 资源不持久化，详情场景仅用于馆藏卡）
    return seedCatalogAdapter.getResourceDetails(resourceId);
  },

  async findResourcesByConcept(conceptId: string, limit?: number): Promise<ResourceCard[]> {
    return seedCatalogAdapter.findResourcesByConcept(conceptId, limit);
  },
};
