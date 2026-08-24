import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("provider settings contract", () => {
  it("keeps provider keys write-only and uses the V3 configuration endpoints", async () => {
    const source = await readFile("components/settings/ProviderSettings.tsx", "utf8");

    expect(source).toContain("/api/v3/providers");
    expect(source).toContain("/api/v3/model-presets");
    expect(source).toContain("hasApiKey");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("value={provider.apiKey}");
  });

  it("only starts a connection test from an explicit user action and validates HTTPS", async () => {
    const source = await readFile("components/settings/ProviderSettings.tsx", "utf8");

    expect(source).toContain("/connection-test");
    expect(source).toContain('new URL(baseUrl).protocol === "https:"');
    expect(source).toContain("onClick={() => testConnection(provider.id)}");
  });
});
