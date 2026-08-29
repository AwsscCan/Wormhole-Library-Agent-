/**
 * 馆藏资源排序（队友02）
 *
 * 在队友01 fallback 的「概念交集 + qualityScore」基础上，升级为
 * 多维权重排序，复用设计文档 §10 的权重体系：
 *
 *   final = 0.30*taskType + 0.25*level + 0.25*quality
 *         + 0.10*language + 0.10*availability + memoryBonus
 *
 * 全部为确定性代码，不依赖 LLM。
 */
import type {
  ResourceCard,
  TaskType,
  Level,
  Difficulty,
  ResourceType,
  Language,
  LanguagePref,
  MemorySummary,
} from "@/lib/types";

export const WEIGHTS = {
  taskType: 0.30,
  level: 0.25,
  quality: 0.25,
  language: 0.10,
  availability: 0.10,
} as const;

/* ---------------- taskType → 资源类型偏好 ---------------- */

export const TASK_TYPE_WEIGHTS: Record<TaskType, Record<ResourceType, number>> = {
  course: { book: 0.90, course: 1.0, paper: 0.50, thesis: 0.30 },
  project: { book: 0.75, course: 0.80, paper: 0.70, thesis: 0.40 },
  research: { book: 0.70, course: 0.40, paper: 1.0, thesis: 0.85 },
  exam: { book: 1.0, course: 0.90, paper: 0.35, thesis: 0.25 },
  curiosity: { book: 0.70, course: 0.75, paper: 0.80, thesis: 0.60 },
};

/* ---------------- level → difficulty 匹配 ---------------- */

export const LEVEL_DIFFICULTY_SCORE: Record<Level, Record<Difficulty, number>> = {
  beginner: { intro: 1.0, undergrad: 0.70, graduate: 0.25, research: 0.05 },
  undergraduate: { intro: 0.70, undergrad: 1.0, graduate: 0.55, research: 0.20 },
  graduate: { intro: 0.30, undergrad: 0.65, graduate: 1.0, research: 0.75 },
  research: { intro: 0.10, undergrad: 0.35, graduate: 0.80, research: 1.0 },
};

/* ---------------- 可获得性 ---------------- */

function getAvailabilityScore(avail: ResourceCard["availability"]): number {
  switch (avail) {
    case "available":
      return 1.0;
    case "online":
      return 0.95;
    case "checked_out":
      return 0.40;
    case "unknown":
      return 0.50;
    default:
      return 0.50;
  }
}

/* ---------------- 语言偏好 ---------------- */

function getLanguageScore(resourceLang: Language, pref?: LanguagePref): number {
  switch (pref) {
    case "zh":
      return resourceLang === "zh" ? 1.0 : 0.55;
    case "en":
      return resourceLang === "en" ? 1.0 : 0.55;
    case "any":
    default:
      return 0.80; // 无偏好：稍降权，避免挤占其他维度
  }
}

/* ---------------- 记忆修正 ---------------- */

function getMemoryBonus(r: ResourceCard, memory?: MemorySummary): number {
  if (!memory) return 0;
  let bonus = 0;

  // 难度偏好
  if (r.difficulty === memory.difficulty.preferredLevel) bonus += 0.04;

  // 数学密集：research 难度 + 低 mathTolerance 时降权
  if (memory.difficulty.mathTolerance < 0.4 && r.difficulty === "research") {
    bonus -= 0.10;
  } else if (memory.difficulty.mathTolerance < 0.4 && r.difficulty === "graduate") {
    bonus -= 0.05;
  }

  // 领域喜好：按概念 domain 近似
  for (const c of r.concepts) {
    if (!c.domain) continue;
    if (memory.serendipity.likedDomains.includes(c.domain)) bonus += 0.05;
    if (memory.serendipity.dislikedDomains.includes(c.domain)) bonus -= 0.08;
  }

  // 资源类型顺序偏好
  const order = memory.reading.resourceTypeOrder;
  if (order && order.length > 0) {
    const idx = order.indexOf(r.type);
    if (idx === 0) bonus += 0.04;
    else if (idx === 1) bonus += 0.02;
    else if (idx >= 2) bonus -= 0.02;
  }

  return Math.max(-0.25, Math.min(0.15, bonus));
}

/* ---------------- 排序上下文 ---------------- */

export interface RankContext {
  /** 原始查询：用于标题/摘要词覆盖加成。 */
  query?: string;
  /** 任务类型（可选，缺省按均衡处理） */
  taskType?: TaskType;
  /** 用户水平（可选） */
  level?: Level;
  /** 用户记忆（可选） */
  memory?: MemorySummary;
  /** 查询概念 ID：用于概念交集匹配加成 */
  conceptIds?: string[];
  /** 语言偏好 */
  language?: LanguagePref;
}

function queryRelevance(r: ResourceCard, query?: string): number {
  const normalized = query?.trim().toLocaleLowerCase();
  if (!normalized) return 0;
  const terms = normalized.match(/[\p{L}\p{N}]+/gu)?.filter((term) => term.length > 1) ?? [];
  if (!terms.length) return 0;
  const title = r.title.toLocaleLowerCase();
  const context = `${r.title} ${r.why}`.toLocaleLowerCase();
  const titleHits = terms.filter((term) => title.includes(term)).length;
  const contextHits = terms.filter((term) => context.includes(term)).length;
  const titleCoverage = titleHits / terms.length;
  const contextCoverage = contextHits / terms.length;
  return Math.min(0.55, (title.includes(normalized) ? 0.2 : 0) + titleCoverage * 0.38 + contextCoverage * 0.1);
}

/**
 * 给单条资源打分（0..1 区间附近的加权分）。
 * 概念交集作为额外加成，帮助与查询概念更相关的资源胜出。
 */
export function scoreResource(r: ResourceCard, ctx: RankContext): number {
  const { taskType, level, memory } = ctx;

  // taskType 分
  let taskScore = 0.5;
  if (taskType) {
    const map = TASK_TYPE_WEIGHTS[taskType];
    taskScore = map[r.type] ?? 0.5;
  }

  // level 分
  let levelScore = 0.5;
  if (level) {
    const map = LEVEL_DIFFICULTY_SCORE[level];
    levelScore = map[r.difficulty] ?? 0.5;
  }

  // quality：团队 ResourceCard 有真实 qualityScore
  const qualScore = r.qualityScore;

  // language：团队 ResourceCard 有真实 language 字段
  const langScore = getLanguageScore(r.language, ctx.language);

  // availability
  const availScore = getAvailabilityScore(r.availability);

  // memory 修正
  const memBonus = getMemoryBonus(r, memory);

  let final =
    WEIGHTS.taskType * taskScore +
    WEIGHTS.level * levelScore +
    WEIGHTS.quality * qualScore +
    WEIGHTS.language * langScore +
    WEIGHTS.availability * availScore +
    memBonus +
    queryRelevance(r, ctx.query);

  // 概念交集加成：每命中一个查询概念 +0.04（上限 0.12）
  if (ctx.conceptIds && ctx.conceptIds.length > 0) {
    const wanted = new Set(ctx.conceptIds);
    const hits = r.concepts.filter((c) => wanted.has(c.id)).length;
    final += Math.min(0.12, hits * 0.04);
  }

  return final;
}

/** 对资源列表按得分从高到低排序（返回新数组，不改原数组）。 */
export function rankResources(resources: ResourceCard[], ctx: RankContext): ResourceCard[] {
  return resources
    .map((r) => ({ r, score: scoreResource(r, ctx) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.r);
}
