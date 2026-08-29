import { afterEach, describe, expect, it } from "vitest";
import { encodeGuestForTest, type CurrentPrincipal } from "@/lib/auth/principal";
import { resetProviderRepositoryForTest, restoreProviderRepositoryForTest, listPresets } from "@/lib/llm/providerRepository";
import { importCcSwitchPresets, listRedactedCcSwitchCatalog } from "@/lib/llm/ccSwitch";

const principal: CurrentPrincipal = { id: "guest-cc-switch-test", mode: "guest" };

describe("CC Switch model bridge", () => {
  afterEach(() => {
    delete process.env.CC_SWITCH_CATALOG_JSON;
    delete process.env.WRITING_CONFIG_ENCRYPTION_KEY;
    restoreProviderRepositoryForTest();
  });

  it("returns a redacted, selectable catalog", async () => {
    process.env.CC_SWITCH_CATALOG_JSON = JSON.stringify({ entries: [{ id: "local", name: "Local Router", mode: "codex", baseUrl: "https://router.example.test", apiKey: "secret", wireApi: "responses", models: [{ id: "gpt-test", name: "GPT Test" }] }] });
    const catalog = await listRedactedCcSwitchCatalog();
    expect(catalog.available).toBe(true);
    expect(catalog.modes.find((item) => item.mode === "codex")?.providers[0]).toEqual({ id: "local", name: "Local Router", mode: "codex", available: true, wireApi: "responses", models: [{ id: "gpt-test", name: "GPT Test" }] });
    expect(JSON.stringify(catalog)).not.toContain("secret");
    expect(JSON.stringify(catalog)).not.toContain("router.example.test");
  });

  it("imports only an exact catalog selection and never accepts a forged model", async () => {
    process.env.WRITING_CONFIG_ENCRYPTION_KEY = "12345678901234567890123456789012";
    process.env.CC_SWITCH_CATALOG_JSON = JSON.stringify({ entries: [{ id: "local", name: "Local Router", mode: "codex", baseUrl: "https://router.example.test", apiKey: "secret", wireApi: "responses", models: ["gpt-test"] }] });
    resetProviderRepositoryForTest();
    const result = await importCcSwitchPresets(principal, "codex", [{ providerId: "local", modelId: "gpt-test" }, { providerId: "local", modelId: "forged-model" }]);
    expect(result.imported).toHaveLength(1);
    expect(result.skipped).toEqual([{ providerId: "local", modelId: "forged-model", reason: "模型不在当前 Provider 目录中" }]);
    expect((await listPresets(principal))[0].model).toBe("gpt-test");
  });

  it("keeps the guest identity server-owned", () => {
    expect(encodeGuestForTest("guest-cc-switch-test")).toContain(".");
  });
});
