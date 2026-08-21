/**
 * 文献综述生成：优先使用可用 LLM；当前 demo 使用可追溯的馆藏摘要拼接。
 * 不把降级结果伪装成模型生成，调用方必须展示 source 标记。
 */
import resourcesSeed from "@/data/seed-resources.json";
import { getLlmProvider } from "@/lib/llm/provider";
import type { ReviewFocus, ReviewRequest, ReviewResponse } from "@/lib/types";

const focusLabels: Record<ReviewFocus, string> = {
  methods: "方法脉络",
  findings: "核心发现",
  timeline: "发展时间线",
};

function fallbackReview(
  selected: (typeof resourcesSeed.resources)[number][],
  focus: ReviewFocus,
): string {
  const summaries = selected
    .map((resource) => `《${resource.title}》指出：${resource.abstract}`)
    .join(" ");
  return `围绕${focusLabels[focus]}，本次选取的 ${selected.length} 条馆藏形成了一条可追溯的阅读线索。${summaries}`;
}

export async function generateLiteratureReview(req: ReviewRequest): Promise<ReviewResponse> {
  const focus = req.focus ?? "methods";
  const selected = req.paperIds.map((id) => resourcesSeed.resources.find((resource) => resource.id === id));
  if (selected.some((resource) => !resource)) {
    throw new Error("One or more selected resources were not found in the demo catalog");
  }

  const resources = selected as (typeof resourcesSeed.resources)[number][];
  const fallback = fallbackReview(resources, focus);
  const prompt = `Write one concise Chinese literature-review paragraph focused on ${focusLabels[focus]} using only: ${fallback}`;
  const generated = await getLlmProvider().complete(prompt);

  return {
    reviewText: generated?.trim() || fallback,
    papersUsed: req.paperIds,
    source: generated?.trim() ? "ollama" : "concat",
  };
}
