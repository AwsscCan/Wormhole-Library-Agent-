import { describe, expect, it } from "vitest";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import {
  createProvider,
  createPreset,
  resetProviderRepositoryForTest,
  resolveModelForWriting,
} from "@/lib/llm/providerRepository";

const ownerA: CurrentPrincipal = { id: "owner-a", mode: "guest" };

describe("provider configuration", () => {
  it("stores provider secrets server-side, returns only hasApiKey, and resolves a step preset first", async () => {
    process.env.WRITING_CONFIG_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    resetProviderRepositoryForTest();
    const created = await createProvider(ownerA, {
      name: "Research", baseUrl: "https://api.example.test", model: "model-a", wireApi: "responses", apiKey: "secret",
    });
    expect(created).toMatchObject({ hasApiKey: true });
    expect(JSON.stringify(created)).not.toContain("secret");
    await expect(createProvider(ownerA, {
      name: "Private", baseUrl: "https://127.0.0.1", model: "model-a", wireApi: "responses", apiKey: "secret",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const provider = await createProvider(ownerA, {
      name: "Second", baseUrl: "https://api.two.test", model: "model-b", wireApi: "chat_completions", apiKey: "secret",
    });
    const presets = await Promise.all(["step", "workflow", "role", "default"].map((name) => createPreset(ownerA, {
      name, providerId: provider.id, model: name, temperature: 0.5, maxTokens: 100,
    })));
    const [step, workflow, role, userDefault] = presets;
    await expect(resolveModelForWriting(ownerA, {
      stepPresetId: step.id, workflowPresetId: workflow.id, rolePresetId: role.id, userDefaultPresetId: userDefault.id,
    })).resolves.toMatchObject({ id: step.id });
  });
});
