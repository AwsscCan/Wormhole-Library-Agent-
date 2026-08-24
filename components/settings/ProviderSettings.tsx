"use client";

import { useEffect, useRef, useState } from "react";
import { Cable, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

type WireApi = "chat_completions" | "responses" | "anthropic_messages";
type Provider = { id: string; name: string; baseUrl: string; model: string; wireApi: WireApi; hasApiKey: boolean };
type Preset = { id: string; name: string; providerId: string; model: string; temperature: number; maxTokens: number };
type ProviderFields = { name: string; baseUrl: string; model: string; wireApi: WireApi };
const blankProvider: ProviderFields = { name: "", baseUrl: "https://", model: "", wireApi: "chat_completions" };

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
  const apiKeyInput = useRef<HTMLInputElement>(null);

  async function load() {
    const [providerResponse, presetResponse] = await Promise.all([fetch("/api/v3/providers", { cache: "no-store" }), fetch("/api/v3/model-presets", { cache: "no-store" })]);
    if (!providerResponse.ok || !presetResponse.ok) { setStatus("暂时无法读取配置；请确认当前账户权限和服务状态。"); return; }
    const nextProviders = await providerResponse.json() as Provider[];
    setProviders(nextProviders);
    setPresets(await presetResponse.json() as Preset[]);
    setPresetForm((current) => ({ ...current, providerId: current.providerId || nextProviders[0]?.id || "" }));
  }
  useEffect(() => { void load(); }, []);
  function resetProviderForm() { setEditingId(null); setProviderForm(blankProvider); if (apiKeyInput.current) apiKeyInput.current.value = ""; }

  async function saveProvider() {
    if (!providerForm.name.trim() || !providerForm.model.trim() || !isHttpsBaseUrl(providerForm.baseUrl)) { setStatus("请填写名称、模型与 HTTPS Provider Base URL。"); return; }
    const apiKey = apiKeyInput.current?.value ?? "";
    const body = { ...providerForm, ...(apiKey ? { apiKey } : {}) };
    if (apiKeyInput.current) apiKeyInput.current.value = "";
    setSaving(true); setStatus("");
    try {
      const response = await fetch(editingId ? `/api/v3/providers/${editingId}` : "/api/v3/providers", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { setStatus("保存失败；请检查字段或服务器端加密配置。"); return; }
      resetProviderForm(); setStatus("Provider 配置已保存。密钥不会再次显示。"); await load();
    } catch { setStatus("保存失败，请检查网络后重试。"); } finally { setSaving(false); }
  }
  async function deleteProvider(providerId: string) {
    const response = await fetch(`/api/v3/providers/${providerId}`, { method: "DELETE" });
    if (!response.ok) { setStatus("删除失败，请重新加载后重试。"); return; }
    if (editingId === providerId) resetProviderForm(); setStatus("Provider 已删除，关联预设将由服务端一致性规则处理。"); await load();
  }
  async function testConnection(providerId: string) {
    setStatus("正在测试连接…");
    try { const response = await fetch(`/api/v3/providers/${providerId}/connection-test`, { method: "POST" }); setStatus(response.ok ? "连接测试成功。" : "连接测试未通过或尚未启用；未显示服务端细节。"); } catch { setStatus("连接测试无法完成，请检查网络后重试。"); }
  }
  async function savePreset() {
    if (!presetForm.name.trim() || !presetForm.providerId || !presetForm.model.trim()) { setStatus("请填写预设名称、Provider 与模型。"); return; }
    const response = await fetch("/api/v3/model-presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: presetForm.name, providerId: presetForm.providerId, model: presetForm.model, temperature: Number(presetForm.temperature), maxTokens: Number(presetForm.maxTokens) }) });
    if (!response.ok) { setStatus("预设保存失败，请检查字段。"); return; }
    setPresetForm((current) => ({ ...current, name: "", model: "" })); setStatus("模型预设已保存。"); await load();
  }

  return <div className="mx-auto max-w-5xl space-y-4">
    <header><h1 className="flex items-center gap-2 font-display text-xl text-ivory"><Cable className="h-5 w-5 text-copper" />Provider 与模型配置</h1><p className="mt-1 text-sm text-steel">密钥为一次性写入字段：提交后立即从浏览器输入框清除，列表仅显示配置状态。</p></header>
    {status && <p className="rounded-md border border-copper/40 bg-copper-faint/30 p-3 text-sm text-copper">{status}</p>}
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]"><Panel><PanelHeader icon={Save} title={editingId ? "provider · 编辑" : "provider · 新建"} accent="cyan" right={editingId ? <Button size="sm" onClick={resetProviderForm}>取消</Button> : undefined} /><PanelBody className="space-y-3"><Input value={providerForm.name} placeholder="Provider 名称" onChange={(event) => setProviderForm((current) => ({ ...current, name: event.target.value }))} /><Input value={providerForm.baseUrl} type="url" placeholder="https://api.example.com" onChange={(event) => setProviderForm((current) => ({ ...current, baseUrl: event.target.value }))} /><Input value={providerForm.model} placeholder="模型 ID" onChange={(event) => setProviderForm((current) => ({ ...current, model: event.target.value }))} /><select value={providerForm.wireApi} onChange={(event) => setProviderForm((current) => ({ ...current, wireApi: event.target.value as WireApi }))} className="h-11 w-full rounded-md border border-ink-border bg-ink-raise px-3 text-sm text-ivory"><option value="chat_completions">OpenAI Chat Completions</option><option value="responses">OpenAI Responses</option><option value="anthropic_messages">Anthropic Messages</option></select><Input ref={apiKeyInput} type="password" autoComplete="new-password" placeholder={editingId ? "可选：替换 API Key" : "API Key（可选，提交后清除）"} /><Button variant="solid" className="w-full" loading={saving} onClick={saveProvider}><Save className="h-4 w-4" />保存 Provider</Button></PanelBody></Panel>
      <Panel><PanelHeader title="providers · 当前账户" accent="copper" /><PanelBody className="space-y-2">{providers.map((provider) => <div key={provider.id} className="rounded-md border border-ink-border bg-ink-raise/60 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm text-ivory">{provider.name}</p><p className="mt-1 break-all font-mono text-[10px] text-steel-dim">{provider.baseUrl} · {provider.model}</p></div><Badge tone={provider.hasApiKey ? "cyan" : "steel"}>{provider.hasApiKey ? "已配置密钥" : "未配置密钥"}</Badge></div><div className="mt-3 flex gap-2"><Button size="sm" onClick={() => { setEditingId(provider.id); setProviderForm({ name: provider.name, baseUrl: provider.baseUrl, model: provider.model, wireApi: provider.wireApi }); if (apiKeyInput.current) apiKeyInput.current.value = ""; }}>编辑</Button><Button size="sm" onClick={() => testConnection(provider.id)}>测试连接</Button><Button size="sm" variant="danger" onClick={() => deleteProvider(provider.id)}><Trash2 className="h-3.5 w-3.5" />删除</Button></div></div>)}{!providers.length && <p className="text-sm text-steel">尚无 Provider 配置。</p>}</PanelBody></Panel></div>
    <Panel><PanelHeader icon={Plus} title="model presets · 模型预设" accent="cyan" /><PanelBody className="grid gap-3 md:grid-cols-5"><Input value={presetForm.name} placeholder="预设名称" onChange={(event) => setPresetForm((current) => ({ ...current, name: event.target.value }))} /><select value={presetForm.providerId} onChange={(event) => setPresetForm((current) => ({ ...current, providerId: event.target.value }))} className="h-11 rounded-md border border-ink-border bg-ink-raise px-3 text-sm text-ivory"><option value="">选择 Provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select><Input value={presetForm.model} placeholder="模型 ID" onChange={(event) => setPresetForm((current) => ({ ...current, model: event.target.value }))} /><Input value={presetForm.temperature} type="number" min="0" max="2" step="0.1" onChange={(event) => setPresetForm((current) => ({ ...current, temperature: event.target.value }))} /><div className="flex gap-2"><Input value={presetForm.maxTokens} type="number" min="1" max="200000" onChange={(event) => setPresetForm((current) => ({ ...current, maxTokens: event.target.value }))} /><Button variant="solid" onClick={savePreset}>保存</Button></div><div className="md:col-span-5 space-y-1">{presets.map((preset) => <p key={preset.id} className="font-mono text-xs text-steel">{preset.name} · {preset.model} · T={preset.temperature} · {preset.maxTokens} tokens</p>)}</div></PanelBody></Panel>
  </div>;
}
