import { describe, expect, it } from "vitest";
import { buildAgentCorpus, buildAgentCorpusContext, buildResearchPlan, fallbackAgentDocument, selectAgentEvidence } from "@/lib/agent/researchGoal";
import type { ResourceCard } from "@/lib/types";

function resource(id: string, title: string, sourceKind: ResourceCard["sourceKind"]): ResourceCard {
  return { id, title, type: sourceKind === "openlibrary" ? "book" : "paper", authors: [], language: "en", why: "matched", availability: "online", difficulty: "research", concepts: [], qualityScore: 0.8, sourceKind, sourceLabel: sourceKind === "openlibrary" ? "Open Library" : "OpenAlex", sourceUrl: `https://example.com/${id}` };
}

describe("goal-driven research agent", () => {
  it("turns one broad goal into complementary searches", () => {
    const plan = buildResearchPlan("研究 RAG 在知识管理中的作用", "literature_review");
    expect(plan.queries).toHaveLength(3);
    expect(plan.queries.map((item) => item.query).join(" ")).toContain("方法");
  });

  it("adds an English catalogue bridge for Chinese research goals", () => {
    const plan = buildResearchPlan("RAG 在个人知识管理中的应用", "search_brief");
    expect(plan.queries[1].query).toBe("personal knowledge management");
    expect(plan.queries[1].purpose).toContain("英文图书");
  });

  it("keeps books from Open Library in the automatically selected evidence", () => {
    const resources = [
      ...Array.from({ length: 15 }, (_, index) => resource(`oa-${index}`, `RAG Knowledge Management ${index}`, "openalex")),
      ...Array.from({ length: 4 }, (_, index) => resource(`ol-${index}`, `RAG Knowledge Management Handbook ${index}`, "openlibrary")),
    ];
    const selected = selectAgentEvidence(resources, { goal: "RAG knowledge management", limit: 10 });
    expect(selected.some((item) => item.sourceKind === "openlibrary")).toBe(true);
  });

  it("creates a traceable fallback document", () => {
    const plan = buildResearchPlan("RAG knowledge management", "summary");
    const markdown = fallbackAgentDocument(plan, [resource("ol-1", "RAG Handbook", "openlibrary")]);
    expect(markdown).toContain("Open Library");
    expect(markdown).toContain("https://example.com/ol-1");
  });

  it("labels a whole-search brief differently from selected-document synthesis", () => {
    const plan = buildResearchPlan("RAG knowledge management", "search_brief");
    const corpus = Array.from({ length: 12 }, (_, index) => resource(`oa-${index}`, `RAG Study ${index}`, "openalex"));
    const markdown = fallbackAgentDocument(plan, corpus.slice(0, 3), corpus);
    expect(markdown).toContain("全量搜索速览");
    expect(markdown).toContain("扫描并去重 12 条");
    expect(markdown).toContain("不等同于对任意单篇文献");
    expect(markdown).toContain("搜索版图");
    expect(markdown).toContain("资料类型");
  });

  it("keeps the full deduplicated result set separate from selected evidence", () => {
    const resources = [
      ...Array.from({ length: 20 }, (_, index) => resource(`oa-${index}`, `RAG Study ${index}`, "openalex")),
      ...Array.from({ length: 12 }, (_, index) => resource(`ol-${index}`, `RAG Handbook ${index}`, "openlibrary")),
    ];
    const corpus = buildAgentCorpus(resources, { goal: "RAG knowledge management" });
    const selected = selectAgentEvidence(corpus, { goal: "RAG knowledge management", limit: 10 });
    expect(corpus).toHaveLength(32);
    expect(selected).toHaveLength(10);
    expect(corpus.filter((item) => item.sourceKind === "openlibrary")).toHaveLength(12);
  });

  it("represents every result in the bounded model context", () => {
    const corpus = Array.from({ length: 24 }, (_, index) => ({
      ...resource(`oa-${index}`, `RAG Study ${index}`, "openalex"),
      why: `Abstract signal ${index} ${"detail ".repeat(20)}`,
    }));
    const context = buildAgentCorpusContext(corpus, 8_000);
    expect(context).toContain("去重结果总数：24");
    expect(context.match(/<record>/g)).toHaveLength(24);
    expect(context).toContain("RAG Study 23");
    expect(context).toContain("摘要线索=Abstract signal 0");
  });
});
