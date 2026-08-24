import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isPublicProviderIp } from "@/lib/llm/networkPolicy";
import type { WireApi } from "@/lib/llm/providerRepository";

export type ProviderConnection = { baseUrl: string; model: string; wireApi: WireApi };
export type ProbeRequest = { url: string; init: RequestInit };
export type ProviderDestination = { hostname: string; address: string; family: 4 | 6; port: number };
export type ProviderProbeResponse = { status: number; headers: Headers; body?: string };
export type ProviderNetwork = {
  lookup(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>>;
  request(probe: ProbeRequest, destination: ProviderDestination): Promise<ProviderProbeResponse>;
};

let installedEgress: ProviderNetwork | undefined;

/** Installs a reviewed server-side egress proxy/transport at the composition root. */
export function installProviderEgress(network: ProviderNetwork): void {
  installedEgress = network;
}

export function clearProviderEgressForTest(): void {
  if (process.env.NODE_ENV === "production") throw new Error("Provider egress cannot be cleared in production");
  installedEgress = undefined;
}

export function buildConnectionProbe(provider: ProviderConnection, apiKey: string): ProbeRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  let path: string;
  let body: string;
  if (provider.wireApi === "anthropic_messages") {
    path = "/v1/messages";
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = JSON.stringify({ model: provider.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
  } else if (provider.wireApi === "responses") {
    path = "/v1/responses";
    headers.authorization = `Bearer ${apiKey}`;
    body = JSON.stringify({ model: provider.model, input: "ping", max_output_tokens: 1 });
  } else {
    path = "/v1/chat/completions";
    headers.authorization = `Bearer ${apiKey}`;
    body = JSON.stringify({ model: provider.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
  }
  return {
    url: `${provider.baseUrl}${path}`,
    init: {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    },
  };
}

export function buildGenerationRequest(
  provider: ProviderConnection,
  apiKey: string,
  options: { model: string; temperature: number; maxTokens: number },
  prompt: string,
): ProbeRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  let path: string;
  let body: string;
  if (provider.wireApi === "anthropic_messages") {
    path = "/v1/messages";
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      messages: [{ role: "user", content: prompt }],
    });
  } else if (provider.wireApi === "responses") {
    path = "/v1/responses";
    headers.authorization = `Bearer ${apiKey}`;
    body = JSON.stringify({
      model: options.model,
      input: prompt,
      temperature: options.temperature,
      max_output_tokens: options.maxTokens,
    });
  } else {
    path = "/v1/chat/completions";
    headers.authorization = `Bearer ${apiKey}`;
    body = JSON.stringify({
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
  }
  return {
    url: `${provider.baseUrl}${path}`,
    init: {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    },
  };
}

const defaultLookup: ProviderNetwork["lookup"] = async (hostname) => {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
};

export async function assertPublicDestination(
  urlValue: string,
  lookup: ProviderNetwork["lookup"] = defaultLookup,
): Promise<ProviderDestination> {
  const url = new URL(urlValue);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) throw new Error("Provider destination is not public");
  let answers: Array<{ address: string; family: 4 | 6 }>;
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    answers = [{ address: hostname, family: literalFamily as 4 | 6 }];
  } else {
    answers = await lookup(hostname);
  }
  if (!answers.length || answers.some(({ address, family }) => isIP(address) !== family || !isPublicProviderIp(address))) {
    throw new Error("Provider destination is not public");
  }
  const selected = answers[0];
  return {
    hostname,
    address: selected.address,
    family: selected.family,
    port: url.port ? Number(url.port) : 443,
  };
}

const pinnedHttpsRequest: ProviderNetwork["request"] = async (probe, destination) => new Promise((resolve, reject) => {
  const url = new URL(probe.url);
  if (url.hostname.replace(/^\[|\]$/g, "") !== destination.hostname) {
    reject(new Error("Provider destination changed after validation"));
    return;
  }
  const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
    callback(null, destination.address, destination.family);
  };
  const request = httpsRequest(url, {
    method: probe.init.method,
    headers: probe.init.headers as Record<string, string>,
    signal: probe.init.signal ?? undefined,
    lookup: pinnedLookup,
    servername: isIP(destination.hostname) ? undefined : destination.hostname,
    agent: false,
  }, (response) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(response.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    let received = 0;
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > 1_000_000) response.destroy(new Error("Provider response is too large"));
      else chunks.push(chunk);
    });
    response.on("end", () => resolve({
      status: response.statusCode ?? 500,
      headers,
      body: Buffer.concat(chunks).toString("utf8"),
    }));
    response.on("error", reject);
  });
  request.on("error", reject);
  if (typeof probe.init.body === "string") request.end(probe.init.body);
  else request.end();
});

export async function testProviderConnection(
  provider: ProviderConnection,
  apiKey: string,
  injectedNetwork?: ProviderNetwork,
): Promise<{ ok: boolean }> {
  const configuredNetwork = injectedNetwork ?? installedEgress;
  if (!configuredNetwork && process.env.NODE_ENV === "test") {
    throw new Error("Provider network is disabled in tests unless an explicit mock transport is injected");
  }
  const network: ProviderNetwork = configuredNetwork ?? { lookup: defaultLookup, request: pinnedHttpsRequest };
  const probe = buildConnectionProbe(provider, apiKey);
  const destination = await assertPublicDestination(probe.url, network.lookup);
  const response = await network.request(probe, destination);
  if (response.status >= 300 && response.status < 400) throw new Error("Provider redirects are not allowed");
  if (response.status < 200 || response.status >= 300) throw new Error("Provider rejected the connection test");
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 1_000_000) throw new Error("Provider response is too large");
  return { ok: true };
}

function configuredNetwork(injectedNetwork?: ProviderNetwork): ProviderNetwork {
  const configured = injectedNetwork ?? installedEgress;
  if (!configured && process.env.NODE_ENV === "test") {
    throw new Error("Provider network is disabled in tests unless an explicit mock transport is injected");
  }
  return configured ?? { lookup: defaultLookup, request: pinnedHttpsRequest };
}

function responseText(wireApi: WireApi, body: string): string {
  const parsed = JSON.parse(body) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
    content?: Array<{ text?: unknown }>;
  };
  const value = wireApi === "chat_completions"
    ? parsed.choices?.[0]?.message?.content
    : wireApi === "anthropic_messages"
      ? parsed.content?.find(({ text }) => typeof text === "string")?.text
      : typeof parsed.output_text === "string"
        ? parsed.output_text
        : parsed.output?.flatMap(({ content }) => content ?? []).find(({ text }) => typeof text === "string")?.text;
  if (typeof value !== "string" || !value.trim()) throw new Error("Provider returned no generated text");
  return value.trim();
}

export async function generateProviderText(
  provider: ProviderConnection,
  apiKey: string,
  options: { model: string; temperature: number; maxTokens: number },
  prompt: string,
  injectedNetwork?: ProviderNetwork,
): Promise<string> {
  const network = configuredNetwork(injectedNetwork);
  const request = buildGenerationRequest(provider, apiKey, options, prompt);
  const destination = await assertPublicDestination(request.url, network.lookup);
  const response = await network.request(request, destination);
  if (response.status >= 300 && response.status < 400) throw new Error("Provider redirects are not allowed");
  if (response.status < 200 || response.status >= 300) throw new Error("Provider rejected draft generation");
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 1_000_000 || (response.body?.length ?? 0) > 1_000_000) {
    throw new Error("Provider response is too large");
  }
  return responseText(provider.wireApi, response.body ?? "");
}
