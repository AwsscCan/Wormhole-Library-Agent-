/**
 * Fallback engine（队友01）
 * 队友02/03 模块未接入时的确定性实现：
 *  - 概念抽取：别名关键词匹配（seed-concepts.json）
 *  - 馆藏检索：seed-resources.json 按概念交集排序
 *  - 虫洞生成：seed-edges.json 上的确定性 BFS 路径 + 设计文档评分公式
 *  - Living Library：consent 过滤（private 绝不返回）
 * 接入真实模块后，orchestrator 替换对应调用即可，接口签名一致（见 lib/types.ts）。
 */
import conceptsSeed from "@/data/seed-concepts.json";
import edgesSeed from "@/data/seed-edges.json";
import resourcesSeed from "@/data/seed-resources.json";
import livingBooksSeed from "@/data/seed-living-books.json";
import type {
  ConceptRef,
  LivingBookCard,
  MemorySummary,
  ResourceCard,
  WillingType,
  WormholeCard,
} from "@/lib/types";

/* ------------------------ seed access ------------------------ */

type SeedConcept = (typeof conceptsSeed)["concepts"][number];
type SeedEdge = (typeof edgesSeed)["edges"][number];
type SeedResource = (typeof resourcesSeed)["resources"][number];
type SeedLivingBook = (typeof livingBooksSeed)["livingBooks"][number];

const concepts: SeedConcept[] = conceptsSeed.concepts;
const edges: SeedEdge[] = edgesSeed.edges;
const resources: SeedResource[] = resourcesSeed.resources;
const livingBooks: SeedLivingBook[] = livingBooksSeed.livingBooks;

const conceptById = new Map(concepts.map((c) => [c.id, c]));

function toConceptRef(id: string): ConceptRef {
  const c = conceptById.get(id);
  return c
    ? { id: c.id, name: c.name, domain: c.domain }
    : { id, name: id };
}

/* --------------------- concept extraction -------------------- */

export function extractConceptsFallback(query: string): ConceptRef[] {
  const q = query.toLowerCase();
  const hits: ConceptRef[] = [];
  for (const c of concepts) {
    const names = [c.name, ...c.aliases].map((s) => s.toLowerCase());
    if (names.some((n) => q.includes(n))) {
      hits.push({ id: c.id, name: c.name, domain: c.domain });
    }
  }
  // 兜底：什么都没匹配到时返回 AI Agent，保证 demo 不空屏
  if (hits.length === 0) {
    hits.push(toConceptRef("c_ai_agent"));
  }
  return hits.slice(0, 4);
}

/* ----------------------- catalog search ---------------------- */

function toResourceCard(r: SeedResource, why: string): ResourceCard {
  return {
    id: r.id,
    type: r.type as ResourceCard["type"],
    title: r.title,
    authors: r.authors,
    year: r.year,
    language: r.language as ResourceCard["language"],
    why,
    location: r.location,
    callNumber: r.callNumber,
    availability: r.availability as ResourceCard["availability"],
    difficulty: r.difficulty as ResourceCard["difficulty"],
    concepts: r.conceptIds.map(toConceptRef),
    qualityScore: r.qualityScore,
  };
}

export function searchCatalogFallback(
  conceptIds: string[],
  memory: MemorySummary,
  limit = 6,
): ResourceCard[] {
  const wanted = new Set(conceptIds);
  const scored = resources
    .map((r) => {
      const overlap = r.conceptIds.filter((id) => wanted.has(id)).length;
      let score = overlap * 10 + r.qualityScore;
      // memory 影响排序：语言偏好 + 难度偏好（可见的记忆效果）
      if (memory.reading.language === "zh_first" && r.language === "zh") score += 0.5;
      if (r.difficulty === memory.difficulty.preferredLevel) score += 0.5;
      return { r, overlap, score };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ r, overlap }) => {
    const names = r.conceptIds
      .filter((id) => wanted.has(id))
      .map((id) => toConceptRef(id).name)
      .join("、");
    return toResourceCard(r, `与你的主题「${names}」直接相关（覆盖 ${overlap} 个概念）。`);
  });
}

export function findResourcesByConceptFallback(conceptId: string): ResourceCard[] {
  return resources
    .filter((r) => r.conceptIds.includes(conceptId))
    .map((r) => toResourceCard(r, `落在虫洞终点「${toConceptRef(conceptId).name}」上的馆藏资源。`));
}

/* ----------------------- living library ---------------------- */

function toLivingBookCard(lb: SeedLivingBook): LivingBookCard {
  return {
    id: lb.id,
    displayMode: lb.displayMode as LivingBookCard["displayMode"],
    displayName:
      lb.consentState === "discoverable_named" && lb.displayName ? lb.displayName : undefined,
    headline: lb.headline,
    expertiseConcepts: lb.conceptIds.map(toConceptRef),
    willingTypes: lb.willingTypes as WillingType[],
    expertiseLevel: lb.expertiseLevel as LivingBookCard["expertiseLevel"],
    availabilityNote: lb.availabilityNote ?? undefined,
    contactState: "request_required",
  };
}

/** consent 过滤：private / paused 绝不返回 */
export function findLivingBooksByConceptFallback(conceptId: string): LivingBookCard[] {
  return livingBooks
    .filter(
      (lb) =>
        lb.consentState.startsWith("discoverable") && lb.conceptIds.includes(conceptId),
    )
    .map(toLivingBookCard);
}

/* -------------------------- wormholes ------------------------ */

const adjacency = new Map<string, SeedEdge[]>();
for (const e of edges) {
  const list = adjacency.get(e.fromConceptId) ?? [];
  list.push(e);
  adjacency.set(e.fromConceptId, list);
}

interface PathCandidate {
  conceptIds: string[];
  edgeWeights: number[];
}

/** 确定性 DFS：找 2-5 跳的所有简单路径 */
function findPaths(startId: string, maxDepth = 5): PathCandidate[] {
  const results: PathCandidate[] = [];
  const walk = (current: string, path: string[], weights: number[]) => {
    if (path.length - 1 >= 2) {
      results.push({ conceptIds: [...path], edgeWeights: [...weights] });
    }
    if (path.length - 1 >= maxDepth) return;
    for (const e of adjacency.get(current) ?? []) {
      if (path.includes(e.toConceptId)) continue;
      walk(e.toConceptId, [...path, e.toConceptId], [...weights, e.weight]);
    }
  };
  walk(startId, [startId], []);
  return results;
}

/** 简易 novelty：跨 domain 步数 / 路径长度（确定性、可解释） */
function estimateNovelty(path: string[]): number {
  const domains = path.map((id) => conceptById.get(id)?.domain ?? "unknown");
  let jumps = 0;
  for (let i = 1; i < domains.length; i++) {
    if (domains[i] !== domains[i - 1]) jumps++;
  }
  return Math.min(1, 0.25 + jumps * 0.22);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function generateWormholesFallback(input: {
  startConceptIds: string[];
  sliderValue: number;
  maxPaths: number;
  memory: MemorySummary;
}): WormholeCard[] {
  const targetNovelty = input.sliderValue / 100;
  const { memory } = input;
  const candidates: WormholeCard[] = [];

  for (const startId of input.startConceptIds) {
    for (const p of findPaths(startId)) {
      const destId = p.conceptIds[p.conceptIds.length - 1];
      const dest = conceptById.get(destId);
      if (!dest) continue;

      const destResources = findResourcesByConceptFallback(destId);
      const destLivingBooks = findLivingBooksByConceptFallback(destId);
      // 设计文档硬规则：虫洞必须落在资源或人物上
      if (destResources.length === 0 && destLivingBooks.length === 0) continue;

      const pathStrength = p.edgeWeights.reduce((a, b) => a + b, 0) / p.edgeWeights.length;
      const pathLen = p.conceptIds.length - 1;
      const pathExplainability = 1 - ((pathLen - 3) ** 2) / 9;
      const bridge = clamp01(0.65 * pathStrength + 0.35 * pathExplainability);
      if (bridge < 0.35) continue;

      const novelty = estimateNovelty(p.conceptIds);
      const noveltyFit = clamp01(1 - Math.abs(novelty - targetNovelty));
      const maxQuality = destResources.length
        ? Math.max(...destResources.map((r) => r.qualityScore))
        : 0.6;
      const quality = clamp01(
        0.45 * maxQuality + 0.25 * 0.9 + 0.2 * Math.min(1, destResources.length / 3) + 0.1 * 0.7,
      );

      let final = 0.4 * bridge + 0.3 * noveltyFit + 0.2 * quality + 0.1 * 1;
      if (memory.serendipity.likedDomains.includes(dest.domain)) final += 0.05;
      if (memory.serendipity.dislikedDomains.includes(dest.domain)) final -= 0.08;
      const mathHeavy = ["Mathematics", "Physics", "Economics"].includes(dest.domain);
      if (mathHeavy && memory.difficulty.mathTolerance < 0.4) final -= 0.1;

      const pathNames = p.conceptIds.map((id) => toConceptRef(id).name);
      candidates.push({
        id: `wh_${startId}_${destId}`,
        path: pathNames,
        pathConceptIds: p.conceptIds,
        destination: dest.name,
        destinationConceptId: destId,
        explanation: `你在研究「${pathNames[0]}」。沿着 ${pathNames
          .slice(1, -1)
          .join(" → ")} 这条概念桥，可以到达「${dest.name}」（${dest.domain}）：${dest.description}`,
        scores: {
          novelty: round2(novelty),
          noveltyFit: round2(noveltyFit),
          bridge: round2(bridge),
          quality: round2(quality),
          diversity: 1,
          final: round2(clamp01(final)),
        },
        resources: destResources,
        livingBooks: destLivingBooks,
      });
    }
  }

  // diversity：贪心去重，同一 destination 只保留最高分；不同 domain 优先
  candidates.sort((a, b) => b.scores.final - a.scores.final);
  const selected: WormholeCard[] = [];
  const usedDest = new Set<string>();
  const usedDomains = new Set<string>();
  for (const c of candidates) {
    if (selected.length >= input.maxPaths) break;
    if (usedDest.has(c.destinationConceptId)) continue;
    const domain = conceptById.get(c.destinationConceptId)?.domain ?? "";
    const diversity = usedDomains.has(domain) ? 0.4 : 1;
    usedDest.add(c.destinationConceptId);
    usedDomains.add(domain);
    selected.push({
      ...c,
      scores: {
        ...c.scores,
        diversity,
        final: round2(clamp01(c.scores.final - (1 - diversity) * 0.1)),
      },
    });
  }
  return selected;
}

/* ------------------------ reading path ----------------------- */

export function buildReadingPathFallback(conceptIds: string[]): string[] {
  const start = conceptIds[0];
  if (!start) return [];
  const names = [toConceptRef(start).name];
  let current = start;
  for (let i = 0; i < 4; i++) {
    const nexts = (adjacency.get(current) ?? []).sort((a, b) => b.weight - a.weight);
    const next = nexts.find((e) => !names.includes(toConceptRef(e.toConceptId).name));
    if (!next) break;
    names.push(toConceptRef(next.toConceptId).name);
    current = next.toConceptId;
  }
  return names;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
