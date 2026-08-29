import "server-only";

import { readFile } from "node:fs/promises";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import { createPreset, createProvider, type WireApi } from "@/lib/llm/providerRepository";

type CcMode = "claude" | "codex";
type ModelOption = { id: string; name: string };
type CcEntry = {
  id: string;
  name: string;
  mode: CcMode;
  baseUrl: string;
  apiKey: string;
  wireApi: WireApi;
  models: ModelOption[];
  available: boolean;
};

export type RedactedCcSwitchProvider = {
  id: string;
  name: string;
  mode: CcMode;
  available: boolean;
  wireApi: WireApi | "";
  models: ModelOption[];
};

export class CcSwitchError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "BAD_REQUEST" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "CcSwitchError";
  }
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return object(parsed);
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value).trim() : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function wireApi(value: unknown, mode: CcMode): WireApi | "" {
  const normalized = stringValue(value).toLowerCase().replaceAll("-", "_");
  if (mode === "claude") return "anthropic_messages";
  if (normalized === "responses") return "responses";
  if (["chat", "chat_completion", "chat_completions"].includes(normalized)) return "chat_completions";
  return "";
}

function modelOptions(models: string[], names: Map<string, string>): ModelOption[] {
  return unique(models).map((id) => ({ id, name: names.get(id) ?? id }));
}

function parseTomlValue(value: string): string | boolean {
  const trimmed = value.trim().replace(/,$/, "");
  if (trimmed === "true" || trimmed === "false") return trimmed === "true";
  const quoted = /^['"](.*)['"]$/.exec(trimmed);
  return quoted ? quoted[1] : trimmed;
}

function parseCodexToml(source: unknown): Record<string, unknown> {
  if (typeof source !== "string") return object(source);
  const result: Record<string, unknown> = {};
  let section = result;
  for (const line of source.split(/\r?\n/)) {
    const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (sectionMatch) {
      section = result;
      for (const part of sectionMatch[1].split(".")) {
        const key = part.trim();
        section[key] = object(section[key]);
        section = section[key] as Record<string, unknown>;
      }
      continue;
    }
    const match = /^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (match) section[match[1]] = parseTomlValue(match[2]);
  }
  return result;
}

async function ccSwitchDirectory(): Promise<string> {
  if (process.env.CC_SWITCH_DIR?.trim()) return process.env.CC_SWITCH_DIR.trim();
  const appData = process.env.APPDATA?.trim() || `${process.env.USERPROFILE ?? ""}\\AppData\\Roaming`;
  const applicationDirectory = `${appData}\\com.ccswitch.desktop`;
  const paths = await readJson(pathJoin(applicationDirectory, "app_paths.json"));
  const override = stringValue(paths.app_config_dir_override);
  return override || applicationDirectory;
}

function pathJoin(directory: string, filename: string): string {
  return `${directory.replace(/[\\/]$/, "")}/${filename}`;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try { return object(await readFile(path, "utf8")); } catch { return {}; }
}

async function readDatabaseEntries(directory: string): Promise<CcEntry[]> {
  const database = pathJoin(directory, "cc-switch.db");
  try {
    const nodeRuntime = process as typeof process & { getBuiltinModule?: (id: string) => unknown };
    const sqlite = nodeRuntime.getBuiltinModule?.("node:sqlite") as { DatabaseSync?: new (path: string, options: { readOnly: boolean }) => { prepare(sql: string): { all(...params: unknown[]): unknown[] }; close(): void } } | undefined;
    if (!sqlite?.DatabaseSync) return [];
    const { DatabaseSync } = sqlite;
    const db = new DatabaseSync(database, { readOnly: true });
    const names = new Map<string, string>();
    try {
      for (const row of db.prepare("SELECT model_id,display_name FROM model_pricing ORDER BY model_id ASC").all() as Array<Record<string, unknown>>) {
        const id = stringValue(row.model_id);
        if (id && !names.has(id)) names.set(id, stringValue(row.display_name) || id);
      }
    } catch { /* Older CC Switch databases may not have model_pricing. */ }
    const common = new Map<string, unknown>();
    try {
      for (const row of db.prepare("SELECT key,value FROM settings").all() as Array<Record<string, unknown>>) common.set(stringValue(row.key), row.value);
    } catch { /* Optional table. */ }
    const entries: CcEntry[] = [];
    for (const mode of ["claude", "codex"] as const) {
      let rows: Array<Record<string, unknown>> = [];
      try {
        rows = db.prepare("SELECT id,name,settings_config,meta,is_current FROM providers WHERE app_type=? ORDER BY is_current DESC, sort_index ASC, name ASC").all(mode) as Array<Record<string, unknown>>;
      } catch { continue; }
      for (const row of rows) {
        const settings = object(row.settings_config);
        const meta = object(row.meta);
        const commonKey = `common_config_${mode}`;
        const hasCommon = meta.commonConfigEnabled === true;
        const merged = hasCommon && common.has(commonKey) ? { ...settings, ...object(common.get(commonKey)) } : settings;
        if (mode === "claude") {
          const env = object(merged.env);
          const models = modelOptions(unique(["ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_FABLE_MODEL"].map((key) => stringValue(env[key]))), names);
          entries.push({ id: stringValue(row.id), name: stringValue(row.name) || stringValue(row.id), mode, baseUrl: stringValue(env.ANTHROPIC_BASE_URL), apiKey: stringValue(env.ANTHROPIC_AUTH_TOKEN) || stringValue(env.ANTHROPIC_API_KEY), wireApi: "anthropic_messages", models, available: Boolean(stringValue(env.ANTHROPIC_BASE_URL) && (stringValue(env.ANTHROPIC_AUTH_TOKEN) || stringValue(env.ANTHROPIC_API_KEY)) && models.length) });
        } else {
          const config = parseCodexToml(merged.config);
          const auth = object(merged.auth);
          const providerName = stringValue(config.model_provider);
          const provider = object(object(config.model_providers)[providerName]);
          const models = modelOptions(unique([stringValue(config.model), ...((Array.isArray(config.models) ? config.models : []) as unknown[]).map(stringValue)]), names);
          const apiKey = stringValue(auth.OPENAI_API_KEY) || stringValue(auth.OPENAI_API_TOKEN) || stringValue(auth.api_key);
          const requiresAuth = provider.requires_openai_auth !== false;
          entries.push({ id: stringValue(row.id), name: stringValue(row.name) || stringValue(row.id), mode, baseUrl: stringValue(provider.base_url), apiKey, wireApi: wireApi(provider.wire_api, mode) as WireApi, models, available: Boolean(stringValue(provider.base_url) && wireApi(provider.wire_api, mode) && (apiKey || !requiresAuth) && models.length) });
        }
      }
    }
    db.close();
    return entries.filter((entry) => entry.id);
  } catch {
    return [];
  }
}

async function readConfigEntries(directory: string): Promise<CcEntry[]> {
  const config = await readJson(pathJoin(directory, "config.json"));
  const entries: CcEntry[] = [];
  for (const mode of ["claude", "codex"] as const) {
    const group = object(config[mode]);
    const providers = object(group.providers || (mode === "claude" ? config.providers : undefined));
    const current = stringValue(group.current);
    for (const id of [current, ...Object.keys(providers).filter((key) => key !== current)].filter(Boolean)) {
      const item = object(providers[id]);
      const settings = object(item.settingsConfig || item.settings_config || item);
      if (mode === "claude") {
        const env = object(settings.env || settings);
        const models = modelOptions([stringValue(env.ANTHROPIC_MODEL), stringValue(env.ANTHROPIC_DEFAULT_OPUS_MODEL), stringValue(env.ANTHROPIC_DEFAULT_SONNET_MODEL), stringValue(env.ANTHROPIC_DEFAULT_HAIKU_MODEL)], new Map());
        const apiKey = stringValue(env.ANTHROPIC_AUTH_TOKEN) || stringValue(env.ANTHROPIC_API_KEY);
        entries.push({ id, name: stringValue(item.name) || id, mode, baseUrl: stringValue(env.ANTHROPIC_BASE_URL), apiKey, wireApi: "anthropic_messages", models, available: Boolean(stringValue(env.ANTHROPIC_BASE_URL) && apiKey && models.length) });
      } else {
        const configToml = parseCodexToml(settings.config);
        const auth = object(settings.auth);
        const providerName = stringValue(configToml.model_provider);
        const provider = object(object(configToml.model_providers)[providerName]);
        const models = modelOptions([stringValue(configToml.model), ...((Array.isArray(configToml.models) ? configToml.models : []) as unknown[]).map(stringValue)], new Map());
        const apiKey = stringValue(auth.OPENAI_API_KEY) || stringValue(auth.OPENAI_API_TOKEN) || stringValue(auth.api_key);
        const api = wireApi(provider.wire_api, mode);
        entries.push({ id, name: stringValue(item.name) || id, mode, baseUrl: stringValue(provider.base_url), apiKey, wireApi: api as WireApi, models, available: Boolean(stringValue(provider.base_url) && api && (apiKey || provider.requires_openai_auth === false) && models.length) });
      }
    }
  }
  return entries;
}

async function loadEntries(): Promise<{ source: string; entries: CcEntry[] }> {
  if (process.env.CC_SWITCH_CATALOG_JSON?.trim()) {
    const configured = object(process.env.CC_SWITCH_CATALOG_JSON);
    const entries = (Array.isArray(configured.entries) ? configured.entries : []).map((item) => {
      const value = object(item);
      const mode = value.mode === "codex" ? "codex" : "claude";
      const api = wireApi(value.wireApi, mode);
      const models = (Array.isArray(value.models) ? value.models : []).map((model) => {
        if (typeof model === "string") return { id: model.trim(), name: model.trim() };
        const item = object(model);
        const id = stringValue(item.id);
        return { id, name: stringValue(item.name) || id };
      }).filter((model) => model.id);
      return { id: stringValue(value.id), name: stringValue(value.name) || stringValue(value.id), mode, baseUrl: stringValue(value.baseUrl), apiKey: stringValue(value.apiKey), wireApi: api as WireApi, models, available: Boolean(value.available ?? (stringValue(value.baseUrl) && api && models.length)) } satisfies CcEntry;
    }).filter((entry) => entry.id);
    return { source: "configured", entries };
  }
  const directory = await ccSwitchDirectory();
  const databaseEntries = await readDatabaseEntries(directory);
  if (databaseEntries.length) return { source: "cc-switch-db", entries: databaseEntries };
  const configEntries = await readConfigEntries(directory);
  return { source: configEntries.length ? "cc-switch-config" : "not-found", entries: configEntries };
}

export async function listRedactedCcSwitchCatalog() {
  const { source, entries } = await loadEntries();
  return {
    source,
    available: source !== "not-found",
    modes: (["claude", "codex"] as const).map((mode) => ({ mode, providers: entries.filter((entry) => entry.mode === mode).map(({ id, name, available, wireApi, models }) => ({ id, name, mode, available, wireApi, models })) })),
  };
}

export async function importCcSwitchPresets(principal: CurrentPrincipal, mode: CcMode, selections: Array<{ providerId: string; modelId: string }>) {
  const { entries } = await loadEntries();
  const allowed = entries.filter((entry) => entry.mode === mode);
  if (!allowed.length) throw new CcSwitchError("NOT_FOUND", "没有找到可导入的 CC Switch 配置");
  const imported: Array<{ providerId: string; providerName: string; presetId: string; modelId: string }> = [];
  const skipped: Array<{ providerId: string; modelId: string; reason: string }> = [];
  for (const selection of selections) {
    const entry = allowed.find((candidate) => candidate.id === selection.providerId);
    if (!entry) { skipped.push({ ...selection, reason: "Provider 不在当前脱敏目录中" }); continue; }
    if (!entry.available || !entry.baseUrl || (entry.wireApi === "anthropic_messages" && !entry.apiKey)) { skipped.push({ ...selection, reason: "Provider 尚未具备可用连接" }); continue; }
    const model = entry.models.find((candidate) => candidate.id === selection.modelId);
    if (!model) { skipped.push({ ...selection, reason: "模型不在当前 Provider 目录中" }); continue; }
    const provider = await createProvider(principal, { name: `CC Switch · ${entry.name} · ${model.name}`, baseUrl: entry.baseUrl, model: model.id, wireApi: entry.wireApi, ...(entry.apiKey ? { apiKey: entry.apiKey } : {}) });
    const preset = await createPreset(principal, { name: `${entry.name} · ${model.name}`, providerId: provider.id, model: model.id, temperature: 0.2, maxTokens: 1200 });
    imported.push({ providerId: provider.id, providerName: provider.name, presetId: preset.id, modelId: model.id });
  }
  return { source: "cc-switch", mode, imported, skipped };
}
