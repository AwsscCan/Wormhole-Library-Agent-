/**
 * Render Memory Context Module
 *
 * Implements the MemoryCompiler.getContext() interface.
 * Renders a human-readable context string for LLM injection.
 *
 * Design doc 11.5: memory budget — max 12 items, 1200 chars.
 * memory_relevance = 0.45*task_match + 0.25*confidence + 0.15*recency + 0.15*success_rate
 *
 * For the MVP, we render all relevant preferences as a simple text block.
 * The orchestrator injects this into the system prompt or tool context.
 */

import type { MemorySnapshot, MemoryHistoryEntry } from "../types";

const MAX_CONTEXT_CHARS = 1200;
const MAX_ITEMS = 12;

/**
 * Render a memory snapshot as a human-readable context string.
 *
 * Format:
 *   "User preferences:
 *    - Language: Chinese-first
 *    - Difficulty: undergraduate level, math tolerance 0.42
 *    - Citation style: APA
 *    - Liked domains: Cognitive Science, Economics
 *    - Disliked domains: Pure Mathematics
 *    - Serendipity slider default: 60"
 */
export function renderMemoryContext(
  memory: MemorySnapshot,
  query?: string
): string {
  const lines: string[] = ["User preferences:"];

  // Reading preferences
  const reading = memory.reading;
  if (reading?.languagePref) {
    const langLabel =
      reading.languagePref === "zh_first" ? "Chinese-first" :
      reading.languagePref === "en_first" ? "English-first" :
      "No preference";
    lines.push(`- Language: ${langLabel}`);
  }
  if (reading?.prefEmpirical) {
    lines.push("- Prefers empirical research");
  }
  if (reading?.prefTheoretical) {
    lines.push("- Prefers theoretical work");
  }
  if (reading?.summaryFirst) {
    lines.push("- Show summary first");
  }

  // Difficulty preferences
  const difficulty = memory.difficulty;
  if (difficulty?.preferredLevel) {
    lines.push(`- Difficulty level: ${difficulty.preferredLevel}`);
  }
  if (difficulty?.mathTolerance !== undefined) {
    const tolLabel =
      difficulty.mathTolerance < 0.3 ? "low" :
      difficulty.mathTolerance < 0.6 ? "moderate" :
      "high";
    lines.push(`- Math tolerance: ${tolLabel} (${difficulty.mathTolerance.toFixed(2)})`);
  }

  // Citation preference
  if (memory.citation?.defaultStyle) {
    lines.push(`- Citation style: ${memory.citation.defaultStyle.toUpperCase()}`);
  }

  // Serendipity preferences
  const serendipity = memory.serendipity;
  if (serendipity?.defaultSlider !== undefined) {
    const sliderLabel =
      serendipity.defaultSlider < 25 ? "conservative" :
      serendipity.defaultSlider < 50 ? "exploratory" :
      serendipity.defaultSlider < 75 ? "adventurous" :
      "deep space";
    lines.push(`- Serendipity: ${sliderLabel} (default ${serendipity.defaultSlider})`);
  }
  if (serendipity?.likedDomains && serendipity.likedDomains.length > 0) {
    lines.push(`- Liked domains: ${serendipity.likedDomains.join(", ")}`);
  }
  if (serendipity?.dislikedDomains && serendipity.dislikedDomains.length > 0) {
    lines.push(`- Disliked domains: ${serendipity.dislikedDomains.join(", ")}`);
  }

  // Truncate to budget
  let result = lines.join("\n");
  if (result.length > MAX_CONTEXT_CHARS) {
    result = result.substring(0, MAX_CONTEXT_CHARS - 3) + "...";
  }

  return result;
}

/**
 * Render memory history as a human-readable timeline.
 * Used by the /memory page.
 */
export function renderMemoryHistory(
  history: MemoryHistoryEntry[]
): string {
  if (history.length === 0) return "No memory updates yet.";

  const lines: string[] = ["Memory update history:"];
  const recent = history.slice(-MAX_ITEMS); // last 12 entries

  for (const entry of recent) {
    const time = new Date(entry.timestamp).toLocaleString();
    lines.push(`- [${time}] ${entry.action}: ${entry.detail}`);
  }

  return lines.join("\n");
}

/**
 * Render a summary of which memories were used in the current request.
 * Used in the search response's "memoryUsed" field.
 */
export function renderMemoryUsed(memory: MemorySnapshot): string[] {
  const used: string[] = [];

  if (memory.reading?.prefEmpirical) used.push("偏好实证研究");
  if (memory.reading?.languagePref === "zh_first") used.push("中文优先");
  if (memory.difficulty?.mathTolerance !== undefined && memory.difficulty.mathTolerance < 0.5) {
    used.push("数学容忍度低");
  }
  if (memory.serendipity?.likedDomains?.length) {
    used.push(`喜欢: ${memory.serendipity.likedDomains.join(", ")}`);
  }
  if (memory.serendipity?.dislikedDomains?.length) {
    used.push(`不喜欢: ${memory.serendipity.dislikedDomains.join(", ")}`);
  }
  if (memory.citation?.defaultStyle) {
    used.push(`引用格式: ${memory.citation.defaultStyle.toUpperCase()}`);
  }

  return used;
}
