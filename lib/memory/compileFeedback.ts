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
      default:
        // 未识别 key：忽略但不报错（前向兼容队友03 的新 key）
        break;
    }
  }
}
