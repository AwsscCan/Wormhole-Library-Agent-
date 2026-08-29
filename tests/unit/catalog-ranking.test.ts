/**
 * 馆藏排序测试（队友02）
 *
 * 覆盖责任书 §10 要求的必测场景：
 *   - course / project / research / exam 的排序差异
 *   - beginner / research 水平的排序差异
 *   - 语言偏好（zh_first / en_first）
 *   - 同分稳定排序
 */
import { describe, expect, it } from "vitest";
import { rankResources, scoreResource, WEIGHTS, TASK_TYPE_WEIGHTS, LEVEL_DIFFICULTY_SCORE } from "@/lib/catalog/ranking";
import type { ResourceCard } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* 测试夹具：覆盖 book/paper/course/thesis × intro/undergrad/graduate/research */
/* ------------------------------------------------------------------ */

function makeCard(
  overrides: Partial<ResourceCard> & { id: string },
): ResourceCard {
  return {
    type: "book",
    title: overrides.id,
    authors: ["Test"],
    language: "en",
    why: "",
    availability: "available",
    difficulty: "undergrad",
    concepts: [],
    qualityScore: 0.80,
    ...overrides,
  };
}

const bookIntro = makeCard({ id: "book_intro", type: "book", difficulty: "intro", qualityScore: 0.75 });
const bookUndergrad = makeCard({ id: "book_ug", type: "book", difficulty: "undergrad", qualityScore: 0.80 });
const paperResearch = makeCard({ id: "paper_res", type: "paper", difficulty: "research", qualityScore: 0.90 });
const courseGraduate = makeCard({ id: "course_grad", type: "course", difficulty: "graduate", qualityScore: 0.85 });
const thesisGrad = makeCard({ id: "thesis_grad", type: "thesis", difficulty: "graduate", qualityScore: 0.75 });
const bookZh = makeCard({ id: "book_zh", type: "book", difficulty: "undergrad", language: "zh", qualityScore: 0.80 });
const paperEn = makeCard({ id: "paper_en", type: "paper", difficulty: "research", language: "en", qualityScore: 0.80 });

/* ------------------------------------------------------------------ */
/* 权重配置完整性                                                         */
/* ------------------------------------------------------------------ */

describe("WEIGHTS 配置", () => {
  it("各维度权重之和等于 1.0", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("TASK_TYPE_WEIGHTS 覆盖全部 5 种 TaskType", () => {
    const types: string[] = ["course", "project", "research", "exam", "curiosity"];
    for (const t of types) {
      expect(TASK_TYPE_WEIGHTS).toHaveProperty(t);
    }
  });

  it("LEVEL_DIFFICULTY_SCORE 覆盖全部 4 种 Level", () => {
    const levels: string[] = ["beginner", "undergraduate", "graduate", "research"];
    for (const l of levels) {
      expect(LEVEL_DIFFICULTY_SCORE).toHaveProperty(l);
    }
  });
});

/* ------------------------------------------------------------------ */
/* taskType 排序差异                                                      */
/* ------------------------------------------------------------------ */

describe("taskType 排序差异", () => {
  const pool = [bookIntro, bookUndergrad, paperResearch, courseGraduate, thesisGrad];

  it("course 任务：course 类型资源排在 thesis 前面", () => {
    const ranked = rankResources(pool, { taskType: "course" });
    const courseIdx = ranked.findIndex((r) => r.type === "course");
    const thesisIdx = ranked.findIndex((r) => r.type === "thesis");
    expect(courseIdx).toBeLessThan(thesisIdx);
  });

  it("research 任务：paper 类型资源排在最前", () => {
    const ranked = rankResources(pool, { taskType: "research" });
    expect(ranked[0].type).toBe("paper");
  });

  it("exam 任务：book 类型资源排在 paper 前面", () => {
    const ranked = rankResources(pool, { taskType: "exam" });
    const bookIdx = ranked.findIndex((r) => r.type === "book");
    const paperIdx = ranked.findIndex((r) => r.type === "paper");
    expect(bookIdx).toBeLessThan(paperIdx);
  });

  it("project 任务：course 排在 thesis 前面", () => {
    const ranked = rankResources(pool, { taskType: "project" });
    const courseIdx = ranked.findIndex((r) => r.type === "course");
    const thesisIdx = ranked.findIndex((r) => r.type === "thesis");
    expect(courseIdx).toBeLessThan(thesisIdx);
  });

  it("course vs research 排序结果必须不同（不同 taskType 产生不同顺序）", () => {
    const rankCourse = rankResources(pool, { taskType: "course" }).map((r) => r.id);
    const rankResearch = rankResources(pool, { taskType: "research" }).map((r) => r.id);
    expect(rankCourse).not.toEqual(rankResearch);
  });
});

/* ------------------------------------------------------------------ */
/* level（用户水平）排序差异                                               */
/* ------------------------------------------------------------------ */

describe("level 排序差异", () => {
  const pool = [bookIntro, bookUndergrad, courseGraduate, paperResearch];

  it("beginner 水平：intro 难度资源得分最高", () => {
    const scores = pool.map((r) => ({
      id: r.id,
      score: scoreResource(r, { level: "beginner" }),
    }));
    scores.sort((a, b) => b.score - a.score);
    expect(scores[0].id).toBe("book_intro");
  });

  it("research 水平：research 难度 paper 得分最高", () => {
    const scores = pool.map((r) => ({
      id: r.id,
      score: scoreResource(r, { level: "research" }),
    }));
    scores.sort((a, b) => b.score - a.score);
    expect(scores[0].id).toBe("paper_res");
  });

  it("beginner 与 research 水平的排序结果必须不同", () => {
    const rankBeginner = rankResources(pool, { level: "beginner" }).map((r) => r.id);
    const rankResearch = rankResources(pool, { level: "research" }).map((r) => r.id);
    expect(rankBeginner).not.toEqual(rankResearch);
  });

  it("beginner 水平下 intro 比 research 排更前", () => {
    const ranked = rankResources(pool, { level: "beginner" });
    const introIdx = ranked.findIndex((r) => r.id === "book_intro");
    const researchIdx = ranked.findIndex((r) => r.id === "paper_res");
    expect(introIdx).toBeLessThan(researchIdx);
  });

  it("research 水平下 research 难度比 intro 难度排更前", () => {
    const ranked = rankResources(pool, { level: "research" });
    const researchIdx = ranked.findIndex((r) => r.id === "paper_res");
    const introIdx = ranked.findIndex((r) => r.id === "book_intro");
    expect(researchIdx).toBeLessThan(introIdx);
  });
});

/* ------------------------------------------------------------------ */
/* 语言偏好                                                              */
/* ------------------------------------------------------------------ */

describe("语言偏好排序", () => {
  const pool = [bookZh, paperEn];

  it("zh 偏好时，中文资源分高于同质量英文资源", () => {
    const scoreZh = scoreResource(bookZh, { language: "zh" });
    const scoreEn = scoreResource(paperEn, { language: "zh" });
    // paperEn 是 research 难度 paper，quality=0.80；bookZh 是 undergrad book，quality=0.80
    // 语言因素差 0.45 分，使 zh 在 zh 偏好下分值更高
    // 注意：此处只校验同等 quality 下语言因素起作用
    const zhLangScore = scoreResource(
      makeCard({ id: "x_zh", type: "book", difficulty: "undergrad", language: "zh", qualityScore: 0.80 }),
      { language: "zh" },
    );
    const enLangScore = scoreResource(
      makeCard({ id: "x_en", type: "book", difficulty: "undergrad", language: "en", qualityScore: 0.80 }),
      { language: "zh" },
    );
    expect(zhLangScore).toBeGreaterThan(enLangScore);
  });

  it("en 偏好时，英文资源语言分高于中文资源", () => {
    const zhLangScore = scoreResource(
      makeCard({ id: "y_zh", type: "book", difficulty: "undergrad", language: "zh", qualityScore: 0.80 }),
      { language: "en" },
    );
    const enLangScore = scoreResource(
      makeCard({ id: "y_en", type: "book", difficulty: "undergrad", language: "en", qualityScore: 0.80 }),
      { language: "en" },
    );
    expect(enLangScore).toBeGreaterThan(zhLangScore);
  });

  it("zh 与 en 偏好下同一资源池排序结果不同", () => {
    const poolMix = [
      makeCard({ id: "m_book_zh", type: "book", difficulty: "undergrad", language: "zh", qualityScore: 0.80 }),
      makeCard({ id: "m_book_en", type: "book", difficulty: "undergrad", language: "en", qualityScore: 0.80 }),
    ];
    const rankZh = rankResources(poolMix, { language: "zh" }).map((r) => r.id);
    const rankEn = rankResources(poolMix, { language: "en" }).map((r) => r.id);
    expect(rankZh[0]).toBe("m_book_zh");
    expect(rankEn[0]).toBe("m_book_en");
  });
});

/* ------------------------------------------------------------------ */
/* 综合上下文（taskType + level）                                         */
/* ------------------------------------------------------------------ */

describe("综合 taskType + level 上下文", () => {
  const pool = [bookIntro, bookUndergrad, paperResearch, courseGraduate, thesisGrad];

  it("research 任务 + research 水平：paper 排第一", () => {
    const ranked = rankResources(pool, { taskType: "research", level: "research" });
    expect(ranked[0].type).toBe("paper");
  });

  it("exam 任务 + beginner 水平：intro book 排在 research paper 前面", () => {
    const ranked = rankResources(pool, { taskType: "exam", level: "beginner" });
    const introIdx = ranked.findIndex((r) => r.id === "book_intro");
    const researchPaperIdx = ranked.findIndex((r) => r.id === "paper_res");
    expect(introIdx).toBeLessThan(researchPaperIdx);
  });
});

/* ------------------------------------------------------------------ */
/* 稳定排序                                                              */
/* ------------------------------------------------------------------ */

describe("稳定排序", () => {
  it("相同上下文下多次调用顺序一致（确定性）", () => {
    const pool = [bookIntro, bookUndergrad, paperResearch, courseGraduate, thesisGrad];
    const ctx = { taskType: "project" as const, level: "undergraduate" as const };
    const r1 = rankResources(pool, ctx).map((r) => r.id);
    const r2 = rankResources(pool, ctx).map((r) => r.id);
    expect(r1).toEqual(r2);
  });

  it("不修改原始数组", () => {
    const pool = [bookIntro, bookUndergrad, paperResearch];
    const original = pool.map((r) => r.id);
    rankResources(pool, { taskType: "exam" });
    expect(pool.map((r) => r.id)).toEqual(original);
  });
});

/* ------------------------------------------------------------------ */
/* 概念交集加成                                                           */
/* ------------------------------------------------------------------ */

describe("概念交集加成", () => {
  const r_with_concept = makeCard({
    id: "with_concept",
    type: "book",
    difficulty: "undergrad",
    qualityScore: 0.70,
    concepts: [{ id: "c_ai_agent", name: "AI Agent" }],
  });
  const r_no_concept = makeCard({
    id: "no_concept",
    type: "book",
    difficulty: "undergrad",
    qualityScore: 0.70,
    concepts: [],
  });

  it("命中查询概念的资源得分高于未命中的同质量资源", () => {
    const scoreWith = scoreResource(r_with_concept, { conceptIds: ["c_ai_agent"] });
    const scoreWithout = scoreResource(r_no_concept, { conceptIds: ["c_ai_agent"] });
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });
});

describe("原始查询相关性", () => {
  it("标题词覆盖会让真实相关论文排在泛化书目之前", () => {
    const broad = makeCard({ id: "broad", title: "AI Engineering", type: "book", qualityScore: 0.95 });
    const exact = makeCard({ id: "exact", title: "Retrieval Augmented Generation Evaluation Benchmark", type: "paper", qualityScore: 0.80 });
    expect(rankResources([broad, exact], { query: "retrieval augmented generation evaluation" })[0]?.id).toBe("exact");
  });
});
