"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, FileText, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ResearchSession } from "@/lib/research/types";
import { SafeMarkdown } from "@/components/notes/SafeMarkdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { AssetDropzone } from "@/components/knowledge/AssetDropzone";

type Stage = "draft" | "evidence_link" | "human_review" | "export";
type Candidate = { id: string; externalEvidenceId: string; title: string; excerpt: string; authors?: string[]; url?: string; provenance: { sourceLabel: string; retrievedAt: string }; verificationStatus: "verified" | "needs_review" | "rejected"; userConfirmedAt?: string };
type DraftResult = { markdown: string; citations: Array<{ evidenceId: string; marker: string }>; source: "provider" | "deterministic" | "restored"; checkpointId: string; stage: Stage };
type Preset = { id: string; name: string; providerId: string; model: string; temperature: number; maxTokens: number };
const stageLabel: Record<string, string> = { evidence: "证据集", verified_sources: "已验证文献", outline: "提纲", draft: "草稿", evidence_link: "证据回链", human_review: "人工复核", export: "已导出" };

function writingError(response: Response, data: { error?: { message?: string } }, fallback: string) {
  if (response.status === 503) return "写作证据端口尚未接入，请稍后重试。";
  return data.error?.message ?? fallback;
}

export default function WritingPage() {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [focus, setFocus] = useState("");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    const response = await fetch("/api/research/sessions", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "无法读取研究会话");
    const loaded = Array.isArray(data.sessions) ? data.sessions as ResearchSession[] : [];
    setSessions(loaded);
    return loaded;
  }, []);

  const selectSession = useCallback(async (id: string, available: ResearchSession[]) => {
    const selected = available.find((item) => item.id === id);
    if (!selected) return;
    setSession(selected); setResult(null); setStatus(""); setSelectedIds(selected.evidenceIds);
    try {
      const [sessionResponse, candidateResponse, draftResponse] = await Promise.all([
        fetch(`/api/research/sessions/${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/v3/writing/candidates?sessionId=${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/v3/writing/drafts?sessionId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      ]);
      const fresh = await sessionResponse.json();
      if (sessionResponse.ok) { setSession(fresh.session as ResearchSession); setSelectedIds((fresh.session as ResearchSession).evidenceIds); }
      if (candidateResponse.ok) {
        const loadedCandidates = await candidateResponse.json();
        setCandidates(Array.isArray(loadedCandidates) ? loadedCandidates as Candidate[] : []);
      }
      if (draftResponse.ok) { const draft = await draftResponse.json(); if (draft) setResult(draft as DraftResult); }
    } catch { setStatus("无法加载该研究会话的写作状态，请刷新后重试。"); }
  }, []);

  useEffect(() => {
    Promise.all([loadSessions(), fetch("/api/v3/model-presets", { cache: "no-store" }).then((response) => response.ok ? response.json() : [])])
      .then(([available, loadedPresets]) => { setPresets(Array.isArray(loadedPresets) ? loadedPresets as Preset[] : []); if (available[0]) void selectSession(available[0].id, available); })
      .catch((error) => setStatus(error instanceof Error ? error.message : "无法加载写作工作区。"));
  }, [loadSessions, selectSession]);

  async function discover() {
    if (!session) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/v3/writing/candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, researchQuestion: session.researchQuestion }) });
      const data = await response.json(); if (!response.ok) throw new Error(writingError(response, data, "候选检索失败"));
      const discovered = Array.isArray(data.candidates) ? data.candidates as Candidate[] : [];
      setCandidates(discovered); setStatus(`已建立 ${discovered.length} 条候选文献。请逐条核验后加入证据篮。`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "候选检索失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  async function confirm(candidate: Candidate) {
    if (!session || candidate.verificationStatus === "verified") return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/v3/writing/candidates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, evidenceId: candidate.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(writingError(response, data, "这条候选缺少可核验来源或作者信息"));
      setCandidates((items) => items.map((item) => item.id === candidate.id ? data as Candidate : item));
      setSelectedIds((ids) => [...new Set([...ids, (data as Candidate).externalEvidenceId])]);
      const available = await loadSessions(); await selectSession(session.id, available);
      setStatus("已确认并加入当前研究会话的证据篮。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "候选确认失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  const verified = useMemo(() => candidates.filter((candidate) => candidate.verificationStatus === "verified"), [candidates]);
  const selectedVerified = verified.filter((candidate) => selectedIds.includes(candidate.externalEvidenceId));

  async function generate() {
    if (!session || !focus.trim() || selectedVerified.length < 3) { setStatus("请先选择一个研究会话，确认至少三条证据，并填写本节焦点。"); return; }
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/v3/writing/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, focus: focus.trim(), evidenceIds: selectedVerified.map((item) => item.externalEvidenceId), ...(selectedPresetId ? { stepPresetId: selectedPresetId } : {}) }) });
      const data = await response.json(); if (!response.ok) throw new Error(writingError(response, data, "草稿生成失败"));
      setResult(data as DraftResult); setStatus(data.source === "provider" ? "Provider 已生成草稿，请检查每段引用。" : "未配置可用 Provider，已使用可追溯的 deterministic 草稿。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "草稿生成失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  async function advance(stage: "evidence_link" | "human_review") {
    if (!session || !result) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/v3/writing/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, stage, ...(stage === "human_review" ? { confirmed: true } : {}) }) });
      const data = await response.json(); if (!response.ok) throw new Error(writingError(response, data, "阶段推进失败"));
      setResult((current) => current ? { ...current, stage: data.stage } : current); setStatus(stage === "human_review" ? "人工复核已确认，现在可以导出。" : "证据回链已建立，请逐段检查引用后确认人工复核。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "阶段推进失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  async function download() {
    if (!session || !result || !["human_review", "export"].includes(result.stage ?? "")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/v3/writing/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id }) });
      if (!response.ok) throw new Error(response.status === 503 ? "写作证据端口尚未接入，请稍后重试。" : "服务端尚未允许导出，请完成人工复核。");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "evidence-bound-draft.md"; anchor.click(); URL.revokeObjectURL(url); setResult((current) => current ? { ...current, stage: "export" } : current);
    } catch (error) { setStatus(error instanceof Error ? error.message : "导出失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="flex items-center gap-2 font-display text-xl text-ivory"><FileText className="h-5 w-5 text-copper" />证据约束写作工作台</h1><p className="mt-1 text-sm text-steel">研究会话、候选文献、检查点和导出工件都在服务端保存，可随时恢复。</p></div><Link href="/research" className="text-xs text-pulse hover:underline">返回研究会话</Link></header>
    {status && <p role="status" className="rounded-md border border-copper/40 bg-copper-faint/30 p-3 text-sm text-copper">{status}</p>}
    <div className="grid gap-4 lg:grid-cols-[260px_1fr_1.1fr]">
      <Panel><PanelHeader icon={FileText} title="sessions · 会话" accent="cyan" /><PanelBody className="space-y-2">{sessions.length === 0 && <p className="text-xs text-steel">还没有研究会话。先去研究页创建一个。</p>}{sessions.map((item) => <button type="button" key={item.id} onClick={() => void selectSession(item.id, sessions)} className={`block w-full rounded-md border p-3 text-left transition-colors ${session?.id === item.id ? "border-pulse/60 bg-pulse-faint/20" : "border-ink-border bg-ink-raise/50 hover:border-pulse/40"}`}><p className="truncate text-sm text-ivory">{item.writingTopic ?? item.researchQuestion}</p><p className="mt-1 text-[10px] text-steel-dim">{item.evidenceIds.length} 条证据 · {item.searches.length} 次检索</p></button>)}</PanelBody></Panel>
      <Panel><PanelHeader icon={Search} title="evidence · 证据篮" accent="copper" right={<Button size="sm" loading={busy} disabled={!session} onClick={discover}><Search className="h-3 w-3" />发现候选</Button>} /><PanelBody className="space-y-2">{!session && <p className="text-xs text-steel">选择研究会话后开始。</p>}{session && <p className="text-xs leading-relaxed text-steel">研究问题：{session.researchQuestion}<br />已确认 {selectedVerified.length} 条，本节至少需要 3 条。</p>}{candidates.map((candidate) => <div key={candidate.id} className="rounded-md border border-ink-border bg-ink-raise/50 p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="text-xs leading-relaxed text-ivory">{candidate.title}</p><p className="mt-1 text-[10px] text-steel-dim">{candidate.authors?.join(" · ") || "作者待核验"} · {candidate.provenance.sourceLabel}</p></div>{candidate.verificationStatus === "verified" ? <Badge tone="cyan"><Check className="h-3 w-3" />已确认</Badge> : <Button size="sm" disabled={busy} onClick={() => void confirm(candidate)}>确认</Button>}</div>{candidate.verificationStatus !== "verified" && <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-steel">{candidate.excerpt}</p>}</div>)}</PanelBody></Panel>
      <div className="space-y-4"><Panel><PanelHeader icon={Sparkles} title="draft · 写作阶段" accent="cyan" right={result && <Badge tone={result.source === "provider" ? "cyan" : "copper"}>{result.source === "provider" ? "Provider" : result.source === "restored" ? "已恢复" : "deterministic"}</Badge>} /><PanelBody className="space-y-3"><div className="flex flex-wrap gap-1.5">{Object.entries(stageLabel).map(([stage, label]) => <span key={stage} className={`rounded border px-2 py-1 text-[10px] ${result?.stage === stage ? "border-pulse/50 text-pulse" : "border-ink-border text-steel-dim"}`}>{label}</span>)}</div><Input value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="本节焦点，例如：比较混合检索的评估方法" disabled={!session} /><select value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)} className="h-10 w-full rounded-md border border-ink-border bg-ink-raise px-3 text-sm text-ivory"><option value="">未选择模型 · deterministic</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.model}</option>)}</select><p className="text-xs text-steel">本节已选 {selectedVerified.length} 条已确认证据 · 参考文献总量不设上限。完整 session collection 保留，本节选择不会截断资料库。</p><Button variant="solid" className="w-full" loading={busy} disabled={!session || Boolean(result)} onClick={generate}><Sparkles className="h-4 w-4" />生成本节草稿</Button>{result && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-steel">当前阶段：{stageLabel[result.stage]}</span>{result.stage === "draft" && <Button size="sm" disabled={busy} onClick={() => void advance("evidence_link")}>建立证据回链</Button>}{result.stage === "evidence_link" && <Button size="sm" disabled={busy} onClick={() => void advance("human_review")}>确认人工复核</Button>}{(result.stage === "human_review" || result.stage === "export") && <Button size="sm" variant="copper" loading={busy} onClick={download}><Download className="h-3.5 w-3.5" />导出 Markdown</Button>}</div>}</PanelBody></Panel>{result && <Panel><PanelHeader icon={FileText} title="artifact · 可审阅工件" /><PanelBody className="space-y-4"><SafeMarkdown markdown={result.markdown} className="space-y-3 text-sm text-steel" /><div className="border-t border-ink-border pt-3"><p className="font-mono text-[10px] uppercase tracking-widest text-steel-dim">citations · 段落证据标记</p><ul className="mt-2 space-y-1 text-xs text-steel">{result.citations.map((citation) => <li key={`${citation.evidenceId}-${citation.marker}`}><code className="text-pulse">{citation.marker}</code> {citation.evidenceId}</li>)}</ul></div><p className="font-mono text-[10px] text-steel-dim">checkpoint: {result.checkpointId}</p></PanelBody></Panel>}</div>
    </div>
    <AssetDropzone />
  </div>;
}
