/**
 * LLM provider 单测：Ollama / 云端 provider 的降级语义与三级自动切换。
 * 不打真实网络 —— stub globalThis.fetch。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetProviderHealth,
  autoSwitchProvider,
  cloudProvider,
  deterministicProvider,
  getLlmProvider,
  ollamaProvider,
} from "@/lib/llm/provider";

const realFetch = globalThis.fetch;

beforeEach(() => {
  __resetProviderHealth();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ollamaProvider.complete 降级语义", () => {
  it("网络不可达（fetch 抛错）→ 返回 null，不抛异常", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(ollamaProvider.complete("hi")).resolves.toBeNull();
  });

  it("非 200 响应 → 返回 null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "model not found" }), {
        status: 404,
      })
    );
    await expect(ollamaProvider.complete("hi")).resolves.toBeNull();
  });

  it("空响应 → 返回 null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ response: "   " }), { status: 200 })
    );
    await expect(ollamaProvider.complete("hi")).resolves.toBeNull();
  });

  it("正常响应 → 返回文本并剥离 <think> 段", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          response: "<think>推理过程…</think>这是综述段落。",
        }),
        { status: 200 }
      )
    );
    await expect(ollamaProvider.complete("hi")).resolves.toBe("这是综述段落。");
  });
});

describe("cloudProvider.complete（OpenAI 兼容协议）", () => {
  it("未配置 LLM_API_KEY → 返回 null（视为未启用）", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    globalThis.fetch = vi.fn();
    await expect(cloudProvider.complete("hi")).resolves.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("配置 key + 200 响应 → 解析 choices 内容并剥离思考段", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "<think>x</think>云端生成的综述。" } },
          ],
        }),
        { status: 200 }
      )
    );
    globalThis.fetch = fetchMock;
    await expect(cloudProvider.complete("hi")).resolves.toBe("云端生成的综述。");
    // 请求应带 Authorization 头、打 /chat/completions
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(String(url)).toContain("/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test"
    );
  });

  it("网络超时/抛错 → 返回 null 不抛异常", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(cloudProvider.complete("hi")).resolves.toBeNull();
  });
});

describe("autoSwitchProvider 三级自动切换", () => {
  function routeFetch(
    handlers: Array<(url: string) => Response | Promise<Response> | "reject">
  ) {
    const calls: string[] = [];
    let i = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const h = handlers[Math.min(i, handlers.length - 1)] as
        | (typeof handlers)[number]
        | undefined;
      i += 1;
      if (!h) throw new Error("no handler");
      const out = h(url);
      if (out === "reject") throw new Error("network down");
      return out;
    }) as unknown as typeof globalThis.fetch;
    return calls;
  }

  it("云端失败 → 自动切 Ollama，返回本地模型结果", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    const calls = routeFetch([
      () => "reject", // cloud 挂
      () =>
        new Response(JSON.stringify({ response: "本地模型结果。" }), {
          status: 200,
        }),
    ]);
    await expect(autoSwitchProvider.complete("hi")).resolves.toBe(
      "本地模型结果。"
    );
    expect(calls[0]).toContain("chat/completions");
    expect(calls[1]).toContain("11434");
  });

  it("云端失败后进入冷却：下一次直接走 Ollama（不再试云端）", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    const calls = routeFetch([
      () => "reject", // 第 1 次：cloud 挂 → ollama 成功
      () =>
        new Response(JSON.stringify({ response: "ok-1" }), { status: 200 }),
      () =>
        new Response(JSON.stringify({ response: "ok-2" }), { status: 200 }),
    ]);
    await expect(autoSwitchProvider.complete("hi")).resolves.toBe("ok-1");
    await expect(autoSwitchProvider.complete("hi")).resolves.toBe("ok-2");
    // 第二次调用只打了一个请求，且是 Ollama 端点（cloud 在冷却中被跳过）
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain("11434");
  });

  it("全部失败 → 返回 null（调用方走确定性模板）", async () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    routeFetch([() => "reject"]);
    await expect(autoSwitchProvider.complete("hi")).resolves.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // cloud + ollama 各试一次
  });

  it("未配置 key 时云端级被跳过，直接走 Ollama", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const calls = routeFetch([
      () =>
        new Response(JSON.stringify({ response: "local." }), { status: 200 }),
    ]);
    await expect(autoSwitchProvider.complete("hi")).resolves.toBe("local.");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("11434");
  });
});

describe("getLlmProvider 选择", () => {
  it("测试环境走 deterministicProvider（complete 恒为 null）", async () => {
    expect(getLlmProvider()).toBe(deterministicProvider);
    await expect(getLlmProvider().complete("hi")).resolves.toBeNull();
  });
});
