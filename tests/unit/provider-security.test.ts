import { describe, expect, it } from "vitest";
import { validateProviderBaseUrl } from "@/lib/llm/providerRepository";
import {
  assertPublicDestination,
  buildConnectionProbe,
  testProviderConnection,
} from "@/lib/llm/providerAdapter";
import * as providerAdapter from "@/lib/llm/providerAdapter";
import type { WireApi } from "@/lib/llm/providerRepository";

describe("provider transport security", () => {
  it.each([
    ["chat_completions", "/v1/chat/completions", "choices", "authorization"],
    ["responses", "/v1/responses", "output_text", "authorization"],
    ["anthropic_messages", "/v1/messages", "content", "x-api-key"],
  ] as const)("generates through the %s wire adapter using only an injected DNS-pinned transport", async (
    wireApi,
    expectedPath,
    responseShape,
    secretHeader,
  ) => {
    const generateProviderText = (providerAdapter as unknown as {
      generateProviderText?: (
        provider: { baseUrl: string; model: string; wireApi: WireApi },
        apiKey: string,
        options: { model: string; temperature: number; maxTokens: number },
        prompt: string,
        network: {
          lookup(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>>;
          request(probe: { url: string; init: RequestInit }): Promise<{ status: number; headers: Headers; body: string }>;
        },
      ) => Promise<string>;
    }).generateProviderText;
    expect(typeof generateProviderText).toBe("function");

    const responseBody = responseShape === "choices"
      ? { choices: [{ message: { content: "Provider fact. [e1]" } }] }
      : responseShape === "output_text"
        ? { output_text: "Provider fact. [e1]" }
        : { content: [{ type: "text", text: "Provider fact. [e1]" }] };
    const generated = await generateProviderText!(
      { baseUrl: "https://provider.example.test", model: "provider-default", wireApi },
      "server-only-secret",
      { model: "owner-step-model", temperature: 0.3, maxTokens: 321 },
      "Allowed evidence: e1",
      {
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
        request: async (probe) => {
          expect(new URL(probe.url).pathname).toBe(expectedPath);
          expect(probe.init.headers).toHaveProperty(secretHeader);
          expect(probe.init.redirect).toBe("manual");
          const body = JSON.parse(String(probe.init.body)) as Record<string, unknown>;
          expect(body.model).toBe("owner-step-model");
          expect(JSON.stringify(body)).toContain("Allowed evidence: e1");
          return { status: 200, headers: new Headers(), body: JSON.stringify(responseBody) };
        },
      },
    );
    expect(generated).toBe("Provider fact. [e1]");
  });

  it("fails closed instead of generating over the real network during tests", async () => {
    const generateProviderText = (providerAdapter as unknown as {
      generateProviderText?: (...args: unknown[]) => Promise<string>;
    }).generateProviderText;
    expect(typeof generateProviderText).toBe("function");
    await expect(generateProviderText!(
      { baseUrl: "https://provider.example.test", model: "m", wireApi: "responses" },
      "test-only-secret",
      { model: "m", temperature: 0, maxTokens: 10 },
      "prompt",
    )).rejects.toThrow(/disabled in tests/i);
  });

  it.each([
    "https://[fc00::1]", "https://[fe80::1]", "https://100.64.0.1", "https://198.18.0.1",
    "https://192.0.2.1", "https://[::1]", "https://169.254.169.254",
    "https://[::ffff:7f00:1]", "https://[::7f00:1]", "https://[2002:7f00:1::]",
    "https://[2001::1]",
  ])("rejects non-public provider address %s", (baseUrl) => {
    expect(() => validateProviderBaseUrl(baseUrl)).toThrow(/not allowed/i);
  });

  it("selects only the configured wire protocol and never includes a secret in diagnostics", () => {
    const request = buildConnectionProbe({ baseUrl: "https://api.example.test", model: "m", wireApi: "anthropic_messages" }, "super-secret");
    expect(request.url).toBe("https://api.example.test/v1/messages");
    expect(request.init.redirect).toBe("manual");
    expect(request.init.headers).toMatchObject({ "x-api-key": "super-secret" });
  });

  it("rejects an embedded private IPv4 result returned by DNS", async () => {
    await expect(assertPublicDestination("https://provider.example.test/v1/models", async () => [
      { address: "::ffff:7f00:1", family: 6 },
    ])).rejects.toThrow(/not public/i);
  });

  it("fails safely instead of using the network when a test transport is not injected", async () => {
    await expect(testProviderConnection({
      baseUrl: "https://provider.example.test",
      model: "m",
      wireApi: "responses",
    }, "test-only-secret")).rejects.toThrow(/disabled in tests/i);
  });

  it.each([
    ["chat_completions", "/v1/chat/completions", "authorization"],
    ["responses", "/v1/responses", "authorization"],
    ["anthropic_messages", "/v1/messages", "x-api-key"],
  ] as Array<[WireApi, string, string]>)
  ("executes the %s adapter through a DNS-pinned egress", async (wireApi, path, secretHeader) => {
    const resolutions: string[] = [];
    const destinations: Array<{ address: string; hostname: string }> = [];
    const result = await testProviderConnection({ baseUrl: "https://provider.example.test", model: "m", wireApi }, "secret", {
      lookup: async (hostname) => {
        resolutions.push(hostname);
        return resolutions.length === 1
          ? [{ address: "93.184.216.34", family: 4 as const }]
          : [{ address: "127.0.0.1", family: 4 as const }];
      },
      request: async (probe, destination) => {
        destinations.push(destination);
        expect(new URL(probe.url).pathname).toBe(path);
        expect(probe.init.headers).toHaveProperty(secretHeader);
        return { status: 200, headers: new Headers() };
      },
    });
    expect(result).toEqual({ ok: true });
    expect(resolutions).toEqual(["provider.example.test"]);
    expect(destinations).toEqual([{ address: "93.184.216.34", hostname: "provider.example.test", family: 4, port: 443 }]);
  });
});
