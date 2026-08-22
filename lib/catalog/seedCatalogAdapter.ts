/**
 * Seed 馆藏适配器（队友02）
 *
 * 基于 data/seed-resources.json 的 CatalogAdapter 实现。
 * 替代队友01 的 searchCatalogFallback，接口签名对齐 lib/types.ts 的 CatalogAdapter。
 *
 * 与 fallback 的差异：
 *  - 支持 resourceTypes / language 过滤
 *  - 排序升级为多维权重（见 ranking.ts），并生成更具体的 why 文案
 */
import resourcesSeed from "@/data/seed-resources.json";
import conceptsSeed from "@/data/seed-concepts.json";
import type {
  CatalogAdapter,
  ConceptRef,
  LanguagePref,
  Level,
  MemorySummary,
  ResourceCard,
  ResourceType,
  TaskType,
} from "@/lib/types";
import { rankResources } from "./ranking";

type SeedResource = (typeof resourcesSeed)["resources"][number];
type SeedConcept = (typeof conceptsSeed)["concepts"][number];

const resources: SeedResource[] = resourcesSeed.resources;
const conceptById = new Map(conceptsSeed.concepts.map((c) => [c.id, c]));

function toConceptRef(id: string): ConceptRef {
  const c = conceptById.get(id);
  return c ? { id: c.id, name: c.name, domain: c.domain } : { id, name: id };
}

function toResourceCard(r: SeedResource, why: string): ResourceCard {
  return {
    id: r.id,
    type: r.type as ResourceType,
    title: r.title,
    authors: r.authors,
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

/** 生成"为什么推荐"的人话文案（结合 taskType / level 更具体） */
function buildWhy(
  r: SeedResource,
  matchedConceptIds: string[],
  taskType?: TaskType,
  level?: Level,
): string {
  const names = matchedConceptIds.map((id) => toConceptRef(id).name);
  const topic = names.length > 0 ? names.slice(0, 3).join("、") : r.title;
  const kind =
    r.type === "book"
      ? "教材"
      : r.type === "paper"
        ? "论文"
        : r.type === "course"
          ? "课程"
          : "学位论文";
  const difficultyLabel: Record<string, string> = {
    intro: "入门",
    undergrad: "本科",
    graduate: "研究生",
    research: "研究级",
  };
  const taskHint: Partial<Record<TaskType, string>> = {
    course: "适合课程学习使用",
    project: "适合项目实践参考",
    research: "适合研究文献阅读",
    exam: "适合备考系统梳理",
    curiosity: "适合兴趣探索阅读",
  };
  const levelHint: Partial<Record<Level, string>> = {
    beginner: "适合零基础入门",
    undergraduate: "适合本科阶段学习",
    graduate: "适合研究生深入研读",
    research: "适合研究者深度参考",
  };
  const taskPart = taskType ? taskHint[taskType] ?? "" : "";
  const levelPart = level ? levelHint[level] ?? "" : "";
  const contextPart = [taskPart, levelPart].filter(Boolean).join("、");
  const baseLine = `与主题「${topic}」直接相关的${kind}，难度为${difficultyLabel[r.difficulty] ?? r.difficulty}，${r.language === "zh" ? "中文内容" : "英文原典"}。`;
  return contextPart ? `${baseLine}${contextPart}。` : baseLine;
}

export const seedCatalogAdapter: CatalogAdapter = {
  async searchCatalog(input) {
    const { query, conceptIds, resourceTypes, language, limit, taskType, level, memory } = input;
    const wanted = conceptIds ? new Set(conceptIds) : null;

    // 1. 按查询词/概念过滤：无 conceptIds 时用 query 关键词匹配标题/摘要
    let candidates: SeedResource[];
    if (wanted && wanted.size > 0) {
      candidates = resources.filter((r) => r.conceptIds.some((id) => wanted.has(id)));
    } else if (query) {
      const q = query.toLowerCase();
      candidates = resources.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.abstract.toLowerCase().includes(q),
      );
    } else {
      candidates = [...resources];
    }

    // 2. 资源类型过滤
    if (resourceTypes && resourceTypes.length > 0) {
      const ts = new Set(resourceTypes);
      candidates = candidates.filter((r) => ts.has(r.type as ResourceType));
    }

    // 3. 转卡片 + 排序（传入完整 RankContext，包含 taskType / level / memory）
    const cards = candidates.map((r) => {
      const matched = wanted
        ? r.conceptIds.filter((id) => wanted.has(id))
        : [];
      return toResourceCard(r, buildWhy(r, matched, taskType as TaskType | undefined, level as Level | undefined));
    });

    const ranked = rankResources(cards, {
      conceptIds: conceptIds ?? [],
      language: language as LanguagePref | undefined,
      taskType: taskType as TaskType | undefined,
      level: level as Level | undefined,
      memory: memory as MemorySummary | undefined,
    });

    return ranked.slice(0, limit ?? 10);
  },

  async getResourceDetails(resourceId) {
    const r = resources.find((x) => x.id === resourceId);
    if (!r) return null;
    return toResourceCard(r, buildWhy(r, r.conceptIds));
  },

  async findResourcesByConcept(conceptId, limit = 10) {
    const matched = resources
      .filter((r) => r.conceptIds.includes(conceptId))
      .map((r) =>
        toResourceCard(
          r,
          `落在概念「${toConceptRef(conceptId).name}」上的馆藏资源，可作为知识虫洞的落点。`,
        ),
      );
    return matched.slice(0, limit);
  },
};
