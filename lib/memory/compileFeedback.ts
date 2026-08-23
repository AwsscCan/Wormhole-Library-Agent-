/**
 * Memory Compiler — fallback 版（队友01）
 * 队友03 的正式 Memory Compiler 完成后替换 compileFeedbackFallback 内部实现，
 * 函数签名与 MemoryCompiler 接口保持一致。
 */
import type {
  FeedbackRequest,
  MemoryPatch,
  MemorySummary,
  WormholeCard,
} from "@/lib/types";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Math.round(x * 100) / 100));
}

export function compileFeedbackFallback(
  req: FeedbackRequest,
  current: MemorySummary,
  targetWormhole?: WormholeCard,
): MemoryPatch[] {
  const patches: MemoryPatch[] = [];
  void current;
  // 优先取虫洞终点资源绑定概念的 domain，其次取人物 expertise 的 domain
  const domain =
    targetWormhole?.resources?.[0]?.concepts?.find((c) => c.domain)?.domain ??
    targetWormhole?.livingBooks?.[0]?.expertiseConcepts?.find((c) => c.domain)?.domain;

  switch (req.rating) {
    case "too_hard":
      patches.push({
        key: "difficulty.mathTolerance",
        operation: "decrement",
        value: 0.08,
        confidenceDelta: 0.1,
        reason: "用户反馈内容太难，降低数学/难度容忍度。",
      });
      break;
    case "too_close":
      patches.push({
        key: "serendipity.defaultSlider",
        operation: "increment",
        value: 10,
        confidenceDelta: 0.08,
        reason: "用户觉得太接近已知，抬高默认意外度。",
      });
      break;
    case "too_far":
      patches.push({
        key: "serendipity.defaultSlider",
        operation: "decrement",
        value: 10,
        confidenceDelta: 0.08,
        reason: "用户觉得跳太远，降低默认意外度。",
      });
      break;
    case "useful":
    case "just_right":
      if (domain) {
        patches.push({
          key: "serendipity.likedDomains",
          operation: "add_or_increment",
          value: domain,
          confidenceDelta: 0.08,
          reason: `用户对「${domain}」方向的推荐给了正反馈。`,
        });
      }
      break;
    case "not_relevant":
      if (domain) {
        patches.push({
          key: "serendipity.dislikedDomains",
          operation: "add_or_increment",
          value: domain,
          confidenceDelta: 0.08,
          reason: `用户认为「${domain}」方向的推荐不相关。`,
        });
      }
      break;
  }

  // 简单 free-text 规则（正式版由队友03 用 LLM/规则库增强）
  const text = (req.freeText ?? "").toLowerCase();
  if (/数学|math/.test(text) && /难|hard|difficult/.test(text)) {
    if (!patches.some((p) => p.key === "difficulty.mathTolerance")) {
      patches.push({
        key: "difficulty.mathTolerance",
        operation: "decrement",
        value: 0.08,
        confidenceDelta: 0.1,
        reason: "自由文本提到数学太难。",
      });
    }
  }
  if (/有趣|有意思|interesting/.test(text) && domain) {
    if (!patches.some((p) => p.key === "serendipity.likedDomains")) {
      patches.push({
        key: "serendipity.likedDomains",
        operation: "add_or_increment",
        value: domain,
        confidenceDelta: 0.08,
        reason: `自由文本表示对「${domain}」感兴趣。`,
      });
    }
  }
  if (/中文|chinese/.test(text)) {
    patches.push({
      key: "reading.language",
      operation: "set",
      value: "zh_first",
      confidenceDelta: 0.15,
      reason: "用户要求中文优先。",
    });
  }

  return patches;
}

/** 把 patches 应用到 MemorySummary（原地修改） */
export function applyPatches(memory: MemorySummary, patches: MemoryPatch[]): void {
  for (const p of patches) {
    switch (p.key) {
      case "difficulty.mathTolerance": {
        const delta = typeof p.value === "number" ? p.value : 0.08;
        memory.difficulty.mathTolerance = clamp01(
          p.operation === "increment"
            ? memory.difficulty.mathTolerance + delta
            : memory.difficulty.mathTolerance - delta,
        );
        break;
      }
      case "serendipity.defaultSlider": {
        if (p.operation === "set") {
          const v = typeof p.value === "number" ? p.value : 50;
          memory.serendipity.defaultSlider = Math.max(0, Math.min(100, v));
          break;
        }
        const delta = typeof p.value === "number" ? p.value : 10;
        const next =
          p.operation === "increment"
            ? memory.serendipity.defaultSlider + delta
            : memory.serendipity.defaultSlider - delta;
        memory.serendipity.defaultSlider = Math.max(0, Math.min(100, next));
        break;
      }
      case "serendipity.likedDomains": {
        const v = String(p.value);
        if (!memory.serendipity.likedDomains.includes(v)) {
          memory.serendipity.likedDomains.push(v);
        }
        memory.serendipity.dislikedDomains = memory.serendipity.dislikedDomains.filter(
          (d) => d !== v,
        );
        break;
      }
      case "serendipity.dislikedDomains": {
        const v = String(p.value);
        if (!memory.serendipity.dislikedDomains.includes(v)) {
          memory.serendipity.dislikedDomains.push(v);
        }
        memory.serendipity.likedDomains = memory.serendipity.likedDomains.filter(
          (d) => d !== v,
        );
        break;
      }
      case "reading.language": {
        memory.reading.language = p.value as MemorySummary["reading"]["language"];
        break;
      }
      /* ---- 责任包03 正式 Memory Compiler 的 key ---- */
      case "reading.prefEmpirical": {
        memory.reading.prefEmpirical = p.value === true;
        break;
      }
      case "reading.prefTheoretical": {
        memory.reading.prefTheoretical = p.value === true;
        break;
      }
      case "reading.summaryFirst": {
        memory.reading.summaryFirst = p.value === true;
        break;
      }
      case "difficulty.theoryTolerance": {
        const cur = memory.difficulty.theoryTolerance ?? 0.5;
        const tDelta = typeof p.value === "number" ? p.value : 0.1;
        memory.difficulty.theoryTolerance = clamp01(
          p.operation === "increment"
            ? cur + tDelta
            : p.operation === "set"
              ? (p.value as number)
              : cur - tDelta,
        );
        break;
      }
      case "citation.defaultStyle": {
        const style = String(p.value) as NonNullable<
          NonNullable<MemorySummary["citation"]>["defaultStyle"]
        >;
        if (memory.citation) {
          memory.citation.defaultStyle = style;
        } else {
          memory.citation = { defaultStyle: style };
        }
        break;
      }
      default:
        // 未识别 key：忽略但不报错（前向兼容队友03 的新 key）
        break;
    }
  }
}


/* ========================================================= */
/* 以下为责任包03 正式实现（与上方 fallback 共存，接口不同） */
/* ========================================================= */


import type {
  Feedback,
  PaperCard,
  ConceptTag,
} from "../types";

/**
 * Domain extraction: map concept names to high-level domains.
 */
const DOMAIN_MAP: Record<string, string> = {
  "AI Agent": "Artificial Intelligence",
  "Multi-Agent Coordination": "Artificial Intelligence",
  "Planning": "Artificial Intelligence",
  "Transformer": "Machine Learning",
  "Attention Mechanism": "Machine Learning",
  "Deep Learning": "Machine Learning",
  "Reinforcement Learning": "Machine Learning",
  "Large Language Model": "Natural Language Processing",
  "Natural Language Processing": "Natural Language Processing",
  "Machine Translation": "Natural Language Processing",
  "Game Theory": "Economics",
  "Mechanism Design": "Economics",
  "Auction Theory": "Economics",
  "Nash Equilibrium": "Economics",
  "Human Memory": "Psychology",
  "Cognitive Psychology": "Psychology",
  "Forgetting Curve": "Psychology",
  "Information Theory": "Mathematics",
  "Probability Theory": "Mathematics",
  "Statistical Physics": "Physics",
  "Phase Transition": "Physics",
  "Library Science": "Information Science",
  "Information Retrieval": "Information Science",
  "Knowledge Graph": "Information Science",
};

/**
 * Extract domain names from a paper's concept tags.
 */
function extractDomainsFromConcepts(concepts: ConceptTag[]): string[] {
  const domains = new Set<string>();
  for (const c of concepts) {
    if (DOMAIN_MAP[c.name]) {
      domains.add(DOMAIN_MAP[c.name]);
    }
  }
  return [...domains];
}

/**
 * Extract domain keywords from free text.
 * Simple keyword matching — no LLM needed.
 */
function extractDomainsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const domains: string[] = [];
  const keywordMap: Record<string, string> = {
    "math": "Mathematics",
    "mathematics": "Mathematics",
    "economics": "Economics",
    "psychology": "Psychology",
    "physics": "Physics",
    "linguistics": "Linguistics",
    "philosophy": "Philosophy",
    "biology": "Biology",
    "chemistry": "Chemistry",
    "machine learning": "Machine Learning",
    "artificial intelligence": "Artificial Intelligence",
    "game theory": "Economics",
    "cognitive": "Psychology",
    "empirical": "Empirical Research",
    "theoretical": "Theoretical Research",
  };
  for (const [keyword, domain] of Object.entries(keywordMap)) {
    if (lower.includes(keyword)) {
      domains.push(domain);
    }
  }
  return domains;
}

/**
 * Compile user feedback into memory patches.
 *
 * @param feedback - The user's feedback (rating + optional freeText)
 * @param paper - The paper being rated (for domain extraction)
 * @returns Array of MemoryPatch objects
 */
export function compileFeedback(
  feedback: Feedback,
  paper?: PaperCard
): MemoryPatch[] {
  const patches: MemoryPatch[] = [];

  switch (feedback.rating) {
    case "too_theoretical":
      // User wants more empirical work
      patches.push({
        key: "reading.prefEmpirical",
        operation: "set",
        value: true,
        confidenceDelta: 0.10,
        reason: "用户反馈过于理论，转为偏好实证研究。",
      });
      patches.push({
        key: "difficulty.theoryTolerance",
        operation: "decrement",
        value: 0.10,
        confidenceDelta: 0.08,
        reason: "降低理论密度容忍度。",
      });
      break;

    case "too_empirical":
      // User wants more theoretical work
      patches.push({
        key: "reading.prefTheoretical",
        operation: "set",
        value: true,
        confidenceDelta: 0.10,
        reason: "用户反馈过于实证，转为偏好理论工作。",
      });
      break;

    case "too_hard":
      // Math tolerance decreases
      patches.push({
        key: "difficulty.mathTolerance",
        operation: "decrement",
        value: 0.08,
        confidenceDelta: 0.10,
        reason: "用户反馈内容太难，降低数学容忍度。",
      });
      // Also check if the paper has math-heavy concepts
      if (paper?.concepts) {
        const hasMath = paper.concepts.some(
          (c) =>
            c.name === "Mathematics" ||
            c.name === "Probability Theory" ||
            c.name === "Statistical Physics"
        );
        if (hasMath) {
          patches.push({
            key: "serendipity.dislikedDomains",
            operation: "add_or_increment",
            value: "Mathematics",
            confidenceDelta: 0.05,
            reason: "数学向论文对用户太难，降低数学领域权重。",
          });
        }
      }
      break;

    case "too_close":
      // 03-02 补交：与概念级语义对齐 —— 太接近已知，抬高默认意外度
      patches.push({
        key: "serendipity.defaultSlider",
        operation: "increment",
        value: 10,
        confidenceDelta: 0.08,
        reason: "用户觉得太接近已知，抬高默认意外度。",
      });
      break;

    case "too_far":
      // 03-02 补交：跳得太远，降低默认意外度
      patches.push({
        key: "serendipity.defaultSlider",
        operation: "decrement",
        value: 10,
        confidenceDelta: 0.08,
        reason: "用户觉得跳得太远，降低默认意外度。",
      });
      break;

    case "not_relevant": {
      // 03-02 补交：不相关 → 将相关领域加入 dislikes（论文概念 + 自由文本）
      const dislikedDomains = new Set<string>();
      if (paper?.concepts) {
        for (const d of extractDomainsFromConcepts(paper.concepts)) {
          dislikedDomains.add(d);
        }
      }
      if (feedback.freeText) {
        for (const d of extractDomainsFromText(feedback.freeText)) {
          dislikedDomains.add(d);
        }
      }
      for (const domain of dislikedDomains) {
        patches.push({
          key: "serendipity.dislikedDomains",
          operation: "add_or_increment",
          value: domain,
          confidenceDelta: 0.08,
          reason: `用户认为「${domain}」方向的推荐不相关。`,
        });
      }
      break;
    }

    case "just_right":
      // No major change, but increment confidence of current preferences
      patches.push({
        key: "reading.summaryFirst",
        operation: "set",
        value: true,
        confidenceDelta: 0.03,
        reason: "反馈正好，保持摘要优先展示。",
      });
      break;

    case "interesting":
      // Extract liked domains from paper concepts and/or free text
      const likedDomains = new Set<string>();
      if (paper?.concepts) {
        for (const d of extractDomainsFromConcepts(paper.concepts)) {
          likedDomains.add(d);
        }
      }
      if (feedback.freeText) {
        for (const d of extractDomainsFromText(feedback.freeText)) {
          likedDomains.add(d);
        }
      }
      for (const domain of likedDomains) {
        patches.push({
          key: "serendipity.likedDomains",
          operation: "add_or_increment",
          value: domain,
          confidenceDelta: 0.08,
          reason: `用户对「${domain}」方向表示兴趣。`,
        });
      }
      // Also set default slider higher if user finds things interesting
      patches.push({
        key: "serendipity.defaultSlider",
        operation: "set",
        value: 70,
        confidenceDelta: 0.05,
        reason: "用户觉得推荐有趣，抬高默认意外度。",
      });
      break;
  }

  // If freeText mentions specific preferences, extract those too
  if (feedback.freeText) {
    const lower = feedback.freeText.toLowerCase();
    if (lower.includes("apa")) {
      patches.push({
        key: "citation.defaultStyle",
        operation: "set",
        value: "apa",
        confidenceDelta: 0.08,
        reason: "自由文本指定 APA 引用格式。",
      });
    } else if (lower.includes("mla")) {
      patches.push({
        key: "citation.defaultStyle",
        operation: "set",
        value: "mla",
        confidenceDelta: 0.08,
        reason: "自由文本指定 MLA 引用格式。",
      });
    } else if (lower.includes("国标") || lower.includes("gbt")) {
      patches.push({
        key: "citation.defaultStyle",
        operation: "set",
        value: "gbt7714",
        confidenceDelta: 0.08,
        reason: "自由文本指定国标 GB/T 7714 引用格式。",
      });
    }
  }

  return patches;
}
