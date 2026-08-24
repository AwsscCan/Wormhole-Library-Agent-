import { randomUUID } from "node:crypto";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import { encryptProviderSecret } from "@/lib/llm/secretBox";

export type WireApi = "chat_completions" | "responses" | "anthropic_messages";
export type ProviderConfigDto = { id: string; name: string; baseUrl: string; model: string; wireApi: WireApi; hasApiKey: boolean };
export type ModelPresetDto = { id: string; name: string; providerId: string; model: string; temperature: number; maxTokens: number };
type StoredProvider = ProviderConfigDto & { ownerId: string; encryptedApiKey?: string };
type StoredPreset = ModelPresetDto & { ownerId: string };
export class ProviderError extends Error { constructor(public code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN", message: string) { super(message); } }
let providers: StoredProvider[] = []; let presets: StoredPreset[] = [];
export function resetProviderRepositoryForTest() { providers = []; presets = []; }
function publicProvider(value: StoredProvider): ProviderConfigDto { const { ownerId: _ownerId, encryptedApiKey, ...dto } = value; return { ...dto, hasApiKey: Boolean(encryptedApiKey) }; }
export function validateProviderBaseUrl(baseUrl: string) {
  let url: URL; try { url = new URL(baseUrl); } catch { throw new ProviderError("BAD_REQUEST", "Provider URL is invalid"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || host === "localhost" || host === "::1" || host === "0.0.0.0" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "169.254.169.254") throw new ProviderError("BAD_REQUEST", "Provider URL is not allowed");
  return url.toString().replace(/\/$/, "");
}
export async function createProvider(principal: CurrentPrincipal, input: Omit<ProviderConfigDto, "id" | "hasApiKey"> & { apiKey?: string }) {
  const baseUrl = validateProviderBaseUrl(input.baseUrl); const encryptedApiKey = input.apiKey ? encryptProviderSecret(input.apiKey) : undefined;
  const record: StoredProvider = { id: randomUUID(), ownerId: principal.id, name: input.name, baseUrl, model: input.model, wireApi: input.wireApi, hasApiKey: Boolean(encryptedApiKey), encryptedApiKey };
  providers.push(record); return publicProvider(record);
}
export async function listProviders(principal: CurrentPrincipal) { return providers.filter((item) => item.ownerId === principal.id).map(publicProvider); }
export async function updateProvider(principal: CurrentPrincipal, id: string, input: Partial<Omit<ProviderConfigDto, "id" | "hasApiKey">> & { apiKey?: string }) {
  const record = providers.find((item) => item.id === id && item.ownerId === principal.id); if (!record) throw new ProviderError("NOT_FOUND", "Provider was not found");
  if (input.baseUrl !== undefined) record.baseUrl = validateProviderBaseUrl(input.baseUrl); if (input.name !== undefined) record.name = input.name; if (input.model !== undefined) record.model = input.model; if (input.wireApi !== undefined) record.wireApi = input.wireApi;
  if (input.apiKey !== undefined) record.encryptedApiKey = input.apiKey ? encryptProviderSecret(input.apiKey) : undefined; record.hasApiKey = Boolean(record.encryptedApiKey); return publicProvider(record);
}
export async function deleteProvider(principal: CurrentPrincipal, id: string) { const prior = providers.length; providers = providers.filter((item) => item.id !== id || item.ownerId !== principal.id); if (prior === providers.length) throw new ProviderError("NOT_FOUND", "Provider was not found"); }
export async function createPreset(principal: CurrentPrincipal, input: Omit<ModelPresetDto, "id">) { if (!providers.some((p) => p.id === input.providerId && p.ownerId === principal.id)) throw new ProviderError("NOT_FOUND", "Provider was not found"); const preset = { ...input, id: randomUUID(), ownerId: principal.id }; presets.push(preset); return { ...input, id: preset.id }; }
export async function listPresets(principal: CurrentPrincipal) { return presets.filter((item) => item.ownerId === principal.id).map(({ ownerId: _owner, ...item }) => item); }
export async function resolveModelForWriting(principal: CurrentPrincipal, input: { stepPresetId?: string; workflowPresetId?: string; rolePresetId?: string; userDefaultPresetId?: string }) { for (const id of [input.stepPresetId, input.workflowPresetId, input.rolePresetId, input.userDefaultPresetId]) { if (!id) continue; const preset = presets.find((item) => item.id === id && item.ownerId === principal.id); if (preset) { const { ownerId: _owner, ...dto } = preset; return dto; } } return null; }
export async function getOwnedProvider(principal: CurrentPrincipal, id: string) { const item = providers.find((p) => p.id === id && p.ownerId === principal.id); if (!item) throw new ProviderError("NOT_FOUND", "Provider was not found"); return item; }
