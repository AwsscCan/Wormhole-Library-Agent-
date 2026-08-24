import { describe, expect, it } from "vitest";
import { validateProviderBaseUrl } from "@/lib/llm/providerRepository";
import { buildConnectionProbe } from "@/lib/llm/providerAdapter";

describe("provider transport security", () => {
  it.each([
    "https://[fc00::1]", "https://[fe80::1]", "https://100.64.0.1", "https://198.18.0.1",
    "https://192.0.2.1", "https://[::1]", "https://169.254.169.254",
  ])("rejects non-public provider address %s", (baseUrl) => {
    expect(() => validateProviderBaseUrl(baseUrl)).toThrow(/not allowed/i);
  });

  it("selects only the configured wire protocol and never includes a secret in diagnostics", () => {
    const request = buildConnectionProbe({ baseUrl: "https://api.example.test", model: "m", wireApi: "anthropic_messages" }, "super-secret");
    expect(request.url).toBe("https://api.example.test/v1/messages");
    expect(request.init.redirect).toBe("manual");
    expect(request.init.headers).toMatchObject({ "x-api-key": "super-secret" });
  });
});
