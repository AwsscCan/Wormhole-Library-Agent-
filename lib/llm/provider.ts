/**
 * LLM provider 抽象（队友01）
 * 规则：LLM 只用于增强解释文案，排序正确性不依赖 LLM。
 *
 * 三级自动切换（autoSwitchProvider）：
 *   1. 云端 API（OpenAI 兼容协议，LLM_API_KEY 配置时启用，速度快优先）
 *   2. Ollama 本地模型（零 API key、零外发流量，断网/欠费兜底）
 *   3. deterministicProvider（返回 null，调用方走确定性拼接模板）
 *
 * 切换策略：按序尝试，某级失败后进入 60s 冷却期（期间直接跳过），
 * 全部冷却则重置重试；任何一级成功即恢复。降级不撒谎：调用方拿到的
 * 结果要么来自真实模型，要么是 null（走模板），绝不伪造模型输出。
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

/** 推理模型思考段剥离（含未闭合的容错） */
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^<think>[\s\S]*/, "")
    .trim();
}

/**
 * Ollama 本地模型 provider（零 API key、零外发流量）。
 *
 * - 端点/模型可配置：OLLAMA_BASE_URL（默认 http://127.0.0.1:11434）、
 *   OLLAMA_MODEL（默认 deepseek-r1:7b）
 * - 任何失败（未启动、模型不存在、超时、非 200）一律返回 null
 * - 兼容推理模型：剥离 <think>…</think> 思考段后再返回
 */
export const ollamaProvider: LlmProvider = {
  async complete(prompt: string): Promise<string | null> {
    const base = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
    const model = process.env.OLLAMA_MODEL ?? "deepseek-r1:7b";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { response?: string };
      const text = stripThinking(data.response ?? "");
      return text.length > 0 ? text : null;
    } catch {
      return null; // Ollama 不可用 → 下一级
    } finally {
      clearTimeout(timer);
    }
  },
};

/**
 * 云端 API provider（OpenAI 兼容 /chat/completions 协议）。
 *
 * - DeepSeek / GPT / Gemini(OpenAI 兼容端点) / 通义等均适用，
 *   换供应商只改 LLM_BASE_URL + LLM_MODEL，代码不动
 * - 环境变量：LLM_API_KEY（必填，缺失即视为未启用返回 null）、
 *   LLM_BASE_URL（默认 DeepSeek）、LLM_MODEL（默认 deepseek-chat）
 * - key 只从环境变量读取（.env.local，已 gitignore），绝不硬编码入库
 * - 超时 15s：网络被墙/代理失效时不至于卡住整个请求
 */
export const cloudProvider: LlmProvider = {
  async complete(prompt: string): Promise<string | null> {
    const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const base = (
      process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1"
    ).replace(/\/+$/, "");
    const model = process.env.LLM_MODEL ?? "deepseek-chat";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = stripThinking(data.choices?.[0]?.message?.content ?? "");
      return text.length > 0 ? text : null;
    } catch {
      return null; // 网络不可达/超时 → 下一级
    } finally {
      clearTimeout(timer);
    }
  },
};

/* ---------------- 三级自动切换 ---------------- */

/** 失败后的冷却时长：期间该级直接跳过（网络抖动自愈窗口） */
const FAIL_COOLDOWN_MS = 60_000;

type HealthMap = Record<string, number>; // provider 名 → 冷却截止时间戳

const gProv = globalThis as unknown as {
  __pkg03ProviderHealth?: HealthMap;
};

function health(): HealthMap {
  if (!gProv.__pkg03ProviderHealth) gProv.__pkg03ProviderHealth = {};
  return gProv.__pkg03ProviderHealth;
}

/** 测试辅助：清空冷却状态 */
export function __resetProviderHealth(): void {
  gProv.__pkg03ProviderHealth = {};
}

/**
 * 自动切换 provider：云端优先（配置了 key 才启用）、Ollama 兜底，
 * 单级失败进入 60s 冷却，全冷却则重置重试（保证最终总有一级被尝试）。
 */
export const autoSwitchProvider: LlmProvider = {
  async complete(prompt: string): Promise<string | null> {
    const now = Date.now();
    const h = health();
    const all: Array<{ name: string; provider: LlmProvider }> = [
      { name: "cloud", provider: cloudProvider },
      { name: "ollama", provider: ollamaProvider },
    ];
    const active = all.filter((c) => !(h[c.name] && h[c.name] > now));
    // 全部在冷却：重置后按原顺序重试（避免永久锁死）
    if (active.length === 0) {
      for (const c of all) delete h[c.name];
    }
    const candidates = active.length > 0 ? active : all;

    for (const { name, provider } of candidates) {
      const started = Date.now();
      const out = await provider.complete(prompt);
      if (out !== null) {
        delete h[name]; // 成功即恢复
        return out;
      }
      // 失败：记冷却（按实际耗时加权，慢比快冷却更久，最短 60s）
      const elapsed = Date.now() - started;
      h[name] = Date.now() + Math.max(FAIL_COOLDOWN_MS, elapsed * 2);
    }
    return null; // 全军覆没 → 确定性模板
  },
};

export function getLlmProvider(): LlmProvider {
  // 测试环境或显式禁用（LLM_DISABLED=1 / OLLAMA_DISABLED=1）时走确定性
  // provider，避免 vitest 里综述用例等待真实网络
  const isTest =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  if (isTest || process.env.LLM_DISABLED === "1") {
    return deterministicProvider;
  }
  return autoSwitchProvider;
}
