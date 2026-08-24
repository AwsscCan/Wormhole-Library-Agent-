import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isPublicProviderIp } from "@/lib/llm/networkPolicy";
import type { WireApi } from "@/lib/llm/providerRepository";

export type ProviderConnection = { baseUrl: string; model: string; wireApi: WireApi };
export type ProbeRequest = { url: string; init: RequestInit };
export type ProviderDestination = { hostname: string; address: string; family: 4 | 6; port: number };
export type ProviderProbeResponse = { status: number; headers: Headers };
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
    response.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > 1_000_000) response.destroy(new Error("Provider response is too large"));
    });
    response.on("end", () => resolve({ status: response.statusCode ?? 500, headers }));
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
