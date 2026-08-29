"use client";

import { useEffect, useRef, useState } from "react";
import { Cable, Check, Languages, Plus, RefreshCw, Save, Sparkles, Trash2, UploadCloud, LibraryBig, Network } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

type WireApi = "chat_completions" | "responses" | "anthropic_messages";
type Provider = { id: string; name: string; baseUrl: string; model: string; wireApi: WireApi; hasApiKey: boolean };
type Preset = { id: string; name: string; providerId: string; model: string; temperature: number; maxTokens: number };
type ProviderFields = { name: string; baseUrl: string; model: string; wireApi: WireApi };
type CcModel = { id: string; name: string };
type CcProvider = { id: string; name: string; mode: "claude" | "codex"; available: boolean; wireApi: WireApi | ""; models: CcModel[] };
type CcCatalog = { source: string; available: boolean; modes: Array<{ mode: "claude" | "codex"; providers: CcProvider[] }> };
const blankProvider: ProviderFields = { name: "", baseUrl: "https://", model: "", wireApi: "chat_completions" };
const deepSeekProvider: ProviderFields = {
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  wireApi: "chat_completions",
};
const loadFailure = "暂时无法读取配置；请确认当前账户权限和服务状态。";
const languageOptions = [
  { id: "any", label: "不偏好" },
  { id: "zh_first", label: "中文优先" },
  { id: "en_first", label: "英文优先" },
] as const;

function isHttpsBaseUrl(baseUrl: string) {
  try { return new URL(baseUrl).protocol === "https:"; } catch { return false; }
}

export function ProviderSettings() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderFields>(blankProvider);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [presetForm, setPresetForm] = useState({ name: "", providerId: "", model: "", temperature: "0.2", maxTokens: "1200" });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState("any");
  const [ccCatalog, setCcCatalog] = useState<CcCatalog | null>(null);
  const [ccMode, setCcMode] = useState<"claude" | "codex">("claude");
  const [ccSelections, setCcSelections] = useState<string[]>([]);
  const [ccBusy, setCcBusy] = useState(false);
  const apiKeyInput = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const [providerResponse, presetResponse] = await Promise.all([
        fetch("/api/v3/providers", { cache: "no-store" }),
        fetch("/api/v3/model-presets", { cache: "no-store" }),
      ]);
      if (!providerResponse.ok || !presetResponse.ok) { setStatus(loadFailure); return; }
      const nextProviders = await providerResponse.json() as Provider[];
      setProviders(nextProviders);
      setPresets(await presetResponse.json() as Preset[]);
      setPresetForm((current) => ({ ...current, providerId: current.providerId || nextProviders[0]?.id || "" }));
    } catch {
      setStatus(loadFailure);
    }
  }

  async function loadCcSwitch() {
    try {
      const response = await fetch("/api/v3/cc-switch/catalog", { cache: "no-store" });
      if (response.ok) {
        const value = await response.json() as Partial<CcCatalog>;
        setCcCatalog({
          source: typeof value.source === "string" ? value.source : "not-found",
          available: value.available === true,
          modes: Array.isArray(value.modes) ? value.modes : [],
        });
      }
    } catch { setCcCatalog(null); }
  }

  useEffect(() => {
    void load();
    void loadCcSwitch();
    const values = Object.fromEntries(document.cookie.split("; ").filter(Boolean).map((part) => part.split("=")));
    setLanguage(values.wl_language ?? "any");
  }, []);

  async function importCcSwitch() {
    const selections = ccSelections.map((value) => {
      const [providerId, modelId] = value.split("\u0000");
      return { providerId, modelId };
    });
    if (!selections.length) return;
    setCcBusy(true);
    try {
      const response = await fetch("/api/v3/cc-switch/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: ccMode, selections }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "导入失败");
      setCcSelections([]);
      setStatus(`已导入 ${data.imported?.length ?? 0} 个模型预设${data.skipped?.length ? `，跳过 ${data.skipped.length} 个不可用项` : ""}。`);
      await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "导入失败，请检查 CC Switch 配置。"); }
    finally { setCcBusy(false); }
  }

  function saveLanguage(nextLanguage: string) {
    setLanguage(nextLanguage);
    document.cookie = `wl_language=${nextLanguage}; Max-Age=31536000; Path=/; SameSite=Lax`;
    setStatus("检索语言偏好已保存；后续检索会优先采用此语种。");
  }

  function resetProviderForm() {
    setEditingId(null);
    setProviderForm(blankProvider);
    if (apiKeyInput.current) apiKeyInput.current.value = "";
  }

  function useDeepSeekPreset() {
    setEditingId(null);
    setProviderForm(deepSeekProvider);
    if (apiKeyInput.current) {
      apiKeyInput.current.value = "";
      apiKeyInput.current.focus();
    }
    setStatus("已填入 DeepSeek 配置。请输入 API Key 后保存；密钥只会写入一次。");
  }

  async function saveProvider() {
    if (!providerForm.name.trim() || !providerForm.model.trim() || !isHttpsBaseUrl(providerForm.baseUrl)) { setStatus("请填写名称、模型与 HTTPS Provider Base URL。"); return; }
    const apiKey = apiKeyInput.current?.value ?? "";
    const body = { ...providerForm, ...(apiKey ? { apiKey } : {}) };
    if (apiKeyInput.current) apiKeyInput.current.value = "";
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch(editingId ? `/api/v3/providers/${editingId}` : "/api/v3/providers", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { setStatus("保存失败；请检查字段或服务器端加密配置。"); return; }
      resetProviderForm();
      setStatus("Provider 配置已保存。密钥不会再次显示。");
      await load();
    } catch {
      setStatus("保存失败，请检查网络后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProvider(providerId: string) {
    try {
      const response = await fetch(`/api/v3/providers/${providerId}`, { method: "DELETE" });
      if (!response.ok) { setStatus("删除失败，请重新加载后再试。"); return; }
      if (editingId === providerId) resetProviderForm();
      setStatus("Provider 已删除，关联预设将由服务端一致性规则处理。");
      await load();
    } catch {
      setStatus("删除失败，请检查网络后重试。");
    }
  }

  async function testConnection(providerId: string) {
    setStatus("正在测试连接…");
    try {
      const response = await fetch(`/api/v3/providers/${providerId}/connection-test`, { method: "POST" });
      setStatus(response.ok ? "连接测试成功。" : "连接测试未通过或尚未启用；未显示服务端细节。");
    } catch {
      setStatus("连接测试无法完成，请检查网络后重试。");
    }
  }

  async function clearProviderKey(providerId: string) {
    if (!window.confirm("确认清除该 Provider 的 API Key？此操作不会删除 Provider。")) return;
    try {
      const response = await fetch(`/api/v3/providers/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "" }),
      });
      if (!response.ok) { setStatus("密钥清除失败，请重新加载后再试。"); return; }
      setStatus("Provider 密钥已清除。");
      await load();
    } catch {
      setStatus("密钥清除失败，请检查网络后重试。");
    }
  }

  async function savePreset() {
    if (!presetForm.name.trim() || !presetForm.providerId || !presetForm.model.trim()) { setStatus("请填写预设名称、Provider 与模型。"); return; }
    try {
      const response = await fetch("/api/v3/model-presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: presetForm.name, providerId: presetForm.providerId, model: presetForm.model, temperature: Number(presetForm.temperature), maxTokens: Number(presetForm.maxTokens) }) });
      if (!response.ok) { setStatus("预设保存失败，请检查字段。"); return; }
      setPresetForm((current) => ({ ...current, name: "", model: "" }));
      setStatus("模型预设已保存。");
      await load();
    } catch {
      setStatus("预设保存失败，请检查网络后重试。");
    }
  }

  return <div className="mx-auto max-w-5xl space-y-4">
    <header><h1 className="flex items-center gap-2 font-display text-xl text-ivory"><Cable className="h-5 w-5 text-copper" />Provider 与模型配置</h1><p className="mt-1 text-sm text-steel">密钥为一次性写入字段：提交后立即从浏览器输入框清除，列表仅显示配置状态。</p></header>
    {status && <p className="rounded-md border border-copper/40 bg-copper-faint/30 p-3 text-sm text-copper">{status}</p>}
    <Panel><PanelHeader icon={Languages} title="workspace · 语言偏好" accent="copper" /><PanelBody><label className="block max-w-md text-xs text-steel"><span className="mb-2 block">检索语言偏好</span><select value={language} onChange={(event) => saveLanguage(event.target.value)} className="h-10 w-full border border-ink-border bg-ink-raise px-3 text-sm text-ivory">{languageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><span className="mt-2 block text-[10px] leading-relaxed text-steel-dim">语言偏好会同时影响联邦检索排序和写作证据发现。</span></label></PanelBody></Panel>
    <Panel><PanelHeader icon={UploadCloud} title="CC Switch · 模型预设导入" accent="cyan" right={<Button size="sm" variant="outline" loading={ccBusy} onClick={() => void loadCcSwitch()}><RefreshCw className="h-3.5 w-3.5" />重新读取</Button>} /><PanelBody className="space-y-3"><p className="text-xs leading-relaxed text-steel">只读取本机的脱敏 Provider × 模型目录。勾选后显式导入为 Wormhole 的独立模型预设，不会改动原配置，也不会在页面显示密钥。</p><div className="flex gap-1 border-b border-ink-border">{(["claude", "codex"] as const).map((mode) => <button key={mode} type="button" onClick={() => { setCcMode(mode); setCcSelections([]); }} className={`border-b-2 px-3 py-2 text-xs uppercase ${ccMode === mode ? "border-pulse text-pulse" : "border-transparent text-steel"}`}>{mode}</button>)}</div>{!ccCatalog && <p className="text-xs text-steel-dim">尚未读取本机目录，点击“重新读取”。</p>}{ccCatalog && !ccCatalog.available && <p className="border border-copper/40 bg-copper-faint/20 p-3 text-xs text-copper">没有找到 CC Switch 本机目录。你仍可以在下方手动配置 Provider。</p>}{ccCatalog?.modes.find((item) => item.mode === ccMode)?.providers.map((provider) => <div key={provider.id} className="border border-ink-border bg-ink-raise/50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm text-ivory">{provider.name}</p><p className="mt-1 text-[10px] text-steel-dim">{provider.wireApi || "未识别 API"} · {provider.available ? "可导入" : "配置不完整"}</p></div><span className={`text-[10px] ${provider.available ? "text-pulse" : "text-copper"}`}>{provider.available ? "ready" : "unavailable"}</span></div>{provider.models.length ? <div className="mt-2 grid gap-1 sm:grid-cols-2">{provider.models.map((model) => { const key = `${provider.id}\u0000${model.id}`; const checked = ccSelections.includes(key); return <label key={model.id} className={`flex items-center gap-2 border px-2 py-1.5 text-xs ${checked ? "border-pulse/60 bg-pulse-faint/30 text-ivory" : "border-ink-border text-steel"}`}><input type="checkbox" checked={checked} disabled={!provider.available || ccBusy} onChange={() => setCcSelections((items) => checked ? items.filter((item) => item !== key) : [...items, key])} className="accent-pulse" /><span className="min-w-0 truncate">{model.name}<span className="ml-1 font-mono text-[9px] text-steel-dim">{model.id}</span></span></label>; })}</div> : <p className="mt-2 text-[10px] text-steel-dim">该 Provider 没有可导入模型。</p>}</div>)}{ccCatalog?.available && !ccCatalog.modes.find((item) => item.mode === ccMode)?.providers.length && <p className="text-xs text-steel-dim">当前模式没有可用 Provider。</p>}<div className="flex items-center justify-between gap-2 border-t border-ink-border pt-3"><span className="text-[10px] text-steel-dim">已选 {ccSelections.length} 个模型 · 来源 {ccCatalog?.source ?? "未读取"}</span><Button variant="solid" size="sm" loading={ccBusy} disabled={!ccSelections.length} onClick={() => void importCcSwitch()}><Check className="h-3.5 w-3.5" />导入选中预设</Button></div></PanelBody></Panel>
    <div className="grid gap-3 md:grid-cols-2"><Link href="/settings/catalog-sources" className="flex items-center gap-3 border border-ink-border bg-ink-panel p-4 transition-colors hover:border-pulse/50"><LibraryBig className="h-5 w-5 text-copper" /><span><strong className="block text-sm text-ivory">馆藏来源</strong><small className="text-xs text-steel">连接个人 OPAC、SRU、OAI-PMH 或高校馆藏</small></span></Link><Link href="/research" className="flex items-center gap-3 border border-ink-border bg-ink-panel p-4 transition-colors hover:border-pulse/50"><Network className="h-5 w-5 text-pulse" /><span><strong className="block text-sm text-ivory">星图与记忆</strong><small className="text-xs text-steel">进入研究工作区调整星图距离和个人层</small></span></Link></div>
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]"><Panel><PanelHeader icon={Save} title={editingId ? "provider · 编辑" : "provider · 新建"} accent="cyan" right={editingId ? <Button size="sm" onClick={resetProviderForm}>取消</Button> : undefined} /><PanelBody className="space-y-3">{!editingId && <Button className="w-full" onClick={useDeepSeekPreset}><Sparkles className="h-4 w-4" />使用 DeepSeek 快速配置</Button>}<Input value={providerForm.name} placeholder="Provider 名称" onChange={(event) => setProviderForm((current) => ({ ...current, name: event.target.value }))} /><Input value={providerForm.baseUrl} type="url" placeholder="https://api.example.com" onChange={(event) => setProviderForm((current) => ({ ...current, baseUrl: event.target.value }))} /><Input value={providerForm.model} placeholder="模型 ID" onChange={(event) => setProviderForm((current) => ({ ...current, model: event.target.value }))} /><select value={providerForm.wireApi} onChange={(event) => setProviderForm((current) => ({ ...current, wireApi: event.target.value as WireApi }))} className="h-11 w-full rounded-md border border-ink-border bg-ink-raise px-3 text-sm text-ivory"><option value="chat_completions">OpenAI Chat Completions</option><option value="responses">OpenAI Responses</option><option value="anthropic_messages">Anthropic Messages</option></select><Input ref={apiKeyInput} type="password" autoComplete="new-password" placeholder={editingId ? "可选：替换 API Key" : "API Key（可选，提交后清除）"} /><Button variant="solid" className="w-full" loading={saving} onClick={saveProvider}><Save className="h-4 w-4" />保存 Provider</Button></PanelBody></Panel>
      <Panel><PanelHeader title="providers · 当前账户" accent="copper" /><PanelBody className="space-y-2">{providers.map((provider) => <div key={provider.id} className="rounded-md border border-ink-border bg-ink-raise/60 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm text-ivory">{provider.name}</p><p className="mt-1 break-all font-mono text-[10px] text-steel-dim">{provider.baseUrl} · {provider.model}</p></div><Badge tone={provider.hasApiKey ? "cyan" : "steel"}>{provider.hasApiKey ? "已配置密钥" : "未配置密钥"}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => { setEditingId(provider.id); setProviderForm({ name: provider.name, baseUrl: provider.baseUrl, model: provider.model, wireApi: provider.wireApi }); if (apiKeyInput.current) apiKeyInput.current.value = ""; }}>编辑</Button><Button size="sm" onClick={() => testConnection(provider.id)}>测试连接</Button>{provider.hasApiKey && <Button size="sm" variant="danger" onClick={() => clearProviderKey(provider.id)}>清除密钥</Button>}<Button size="sm" variant="danger" onClick={() => deleteProvider(provider.id)}><Trash2 className="h-3.5 w-3.5" />删除</Button></div></div>)}{!providers.length && <p className="text-sm text-steel">尚无 Provider 配置。</p>}</PanelBody></Panel></div>
    <Panel><PanelHeader icon={Plus} title="model presets · 模型预设" accent="cyan" /><PanelBody className="grid gap-3 md:grid-cols-5"><Input value={presetForm.name} placeholder="预设名称" onChange={(event) => setPresetForm((current) => ({ ...current, name: event.target.value }))} /><select value={presetForm.providerId} onChange={(event) => setPresetForm((current) => ({ ...current, providerId: event.target.value }))} className="h-11 rounded-md border border-ink-border bg-ink-raise px-3 text-sm text-ivory"><option value="">选择 Provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select><Input value={presetForm.model} placeholder="模型 ID" onChange={(event) => setPresetForm((current) => ({ ...current, model: event.target.value }))} /><Input value={presetForm.temperature} type="number" min="0" max="2" step="0.1" onChange={(event) => setPresetForm((current) => ({ ...current, temperature: event.target.value }))} /><div className="flex gap-2"><Input value={presetForm.maxTokens} type="number" min="1" max="200000" onChange={(event) => setPresetForm((current) => ({ ...current, maxTokens: event.target.value }))} /><Button variant="solid" onClick={savePreset}>保存</Button></div><div className="md:col-span-5 space-y-1">{presets.map((preset) => <p key={preset.id} className="font-mono text-xs text-steel">{preset.name} · {preset.model} · T={preset.temperature} · {preset.maxTokens} tokens</p>)}</div></PanelBody></Panel>
  </div>;
}
