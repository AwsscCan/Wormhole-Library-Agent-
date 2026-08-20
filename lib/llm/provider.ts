/**
 * LLM provider 抽象（队友01）
 * 规则：LLM 只用于增强解释文案，排序正确性不依赖 LLM。
 * 没有 API key 时全部走 deterministic provider。
 */
export interface LlmProvider {
  /** 返回 null 表示不可用，调用方必须使用确定性 fallback */
  complete(prompt: string): Promise<string | null>;
}

export const deterministicProvider: LlmProvider = {
  async complete() {
    return null; // 强制调用方走确定性模板
  },
};

export function getLlmProvider(): LlmProvider {
  // 有 OPENAI_API_KEY 时后续可返回 openaiCompatibleProvider
  return deterministicProvider;
}
