/**
 * 星图模型（队友01）— 客户端安全的纯函数
 * 由 seed 概念/边构建 React Flow 节点与边；
 * query 命中时高亮节点并点亮邻接边（"知识从中心展开"的数据基础）。
 */
import conceptsSeed from "@/data/seed-concepts.json";
import edgesSeed from "@/data/seed-edges.json";

export type StarState = "idle" | "hit" | "linked";

export interface StarNodeModel {
  id: string;
  label: string;
  domain: string;
  state: StarState;
  index: number;
  x: number;
  y: number;
}

export interface StarEdgeModel {
  id: string;
  source: string;
  target: string;
  lit: boolean;
}

const concepts = conceptsSeed.concepts;
const edges = edgesSeed.edges;

/** 与 fallbackEngine 相同的别名匹配规则（保持前后端一致） */
export function matchConceptIds(query: string): Set<string> {
  const q = query.trim().toLowerCase();
  const hits = new Set<string>();
  if (q.length < 2) return hits;
  for (const c of concepts) {
    const names = [c.name, ...c.aliases].map((s) => s.toLowerCase());
    if (names.some((n) => q.includes(n) || (n.length >= 3 && n.includes(q)))) {
      hits.add(c.id);
    }
  }
  return hits;
}

/** 确定性放射状布局：按 domain 分扇区，扇区内按序摆放 */
export function buildStarModel(query: string): {
  nodes: StarNodeModel[];
  edges: StarEdgeModel[];
} {
  const hits = matchConceptIds(query);

  const linked = new Set<string>();
  for (const e of edges) {
    if (hits.has(e.fromConceptId)) linked.add(e.toConceptId);
    if (hits.has(e.toConceptId)) linked.add(e.fromConceptId);
  }

  const domains = [...new Set(concepts.map((c) => c.domain))];
  const byDomain = new Map<string, typeof concepts>();
  for (const c of concepts) {
    const list = byDomain.get(c.domain) ?? [];
    list.push(c);
    byDomain.set(c.domain, list);
  }

  const nodes: StarNodeModel[] = [];
  let index = 0;
  domains.forEach((domain, di) => {
    const group = byDomain.get(domain)!;
    const sectorCenter = (di / domains.length) * Math.PI * 2 - Math.PI / 2;
    const spread = ((Math.PI * 2) / domains.length) * 0.72;
    group.forEach((c, i) => {
      const t = group.length === 1 ? 0.5 : i / (group.length - 1);
      const angle = sectorCenter + (t - 0.5) * spread;
      const radius = 170 + (i % 3) * 78 + (c.popularity ?? 0.5) * 30;
      nodes.push({
        id: c.id,
        label: c.name,
        domain,
        state: hits.has(c.id) ? "hit" : linked.has(c.id) ? "linked" : "idle",
        index: index++,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });
  });

  const starEdges: StarEdgeModel[] = edges.map((e, i) => ({
    id: `e${i}`,
    source: e.fromConceptId,
    target: e.toConceptId,
    lit: hits.has(e.fromConceptId) || hits.has(e.toConceptId),
  }));

  return { nodes, edges: starEdges };
}
