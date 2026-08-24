import "server-only";
import { lookup } from "node:dns/promises";
import type { WireApi } from "@/lib/llm/providerRepository";

export type ProviderConnection = { baseUrl: string; model: string; wireApi: WireApi };
export type ProbeRequest = { url: string; init: RequestInit };

export function buildConnectionProbe(provider: ProviderConnection, apiKey: string): ProbeRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  let path: string; let body: string;
  if (provider.wireApi === "anthropic_messages") {
    path = "/v1/messages"; headers["x-api-key"] = apiKey; headers["anthropic-version"] = "2023-06-01";
    body = JSON.stringify({ model: provider.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
  } else if (provider.wireApi === "responses") {
    path = "/v1/responses"; headers.authorization = `Bearer ${apiKey}`; body = JSON.stringify({ model: provider.model, input: "ping", max_output_tokens: 1 });
  } else {
    path = "/v1/chat/completions"; headers.authorization = `Bearer ${apiKey}`; body = JSON.stringify({ model: provider.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
  }
  return { url: `${provider.baseUrl}${path}`, init: { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(10_000) } };
}

function isPublicIp(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower.includes(":")) {
    if (lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || /^fe[89ab]/.test(lower) || lower.startsWith("ff")) return false;
    if (lower.startsWith("2001:db8")) return false;
    return true;
  }
  const octets = lower.split(".").map(Number); if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 2 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0)) return false;
  return true;
}
export async function assertPublicDestination(urlValue: string): Promise<void> {
  const url = new URL(urlValue); const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || !isPublicIp(host) && /^[\d.]+$|:/.test(host)) throw new Error("Provider destination is not public");
  if (/^[\d.]+$|:/.test(host)) return;
  const answers = await lookup(host, { all: true, verbatim: true });
  if (!answers.length || answers.some((answer) => !isPublicIp(answer.address))) throw new Error("Provider destination is not public");
}
export async function testProviderConnection(provider: ProviderConnection, apiKey: string): Promise<{ ok: boolean }> {
  const probe = buildConnectionProbe(provider, apiKey); await assertPublicDestination(probe.url);
  const response = await fetch(probe.url, probe.init);
  if (response.status >= 300 && response.status < 400) throw new Error("Provider redirects are not allowed");
  if (!response.ok) throw new Error("Provider rejected the connection test");
  const contentLength = Number(response.headers.get("content-length") ?? "0"); if (contentLength > 1_000_000) throw new Error("Provider response is too large");
  return { ok: true };
}
