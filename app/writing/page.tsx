"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Download, FileText, Flag, ListChecks, Pause, Play, RotateCcw, Search, Settings2, Sparkles, Trash2, Upload } from "lucide-react";
import type { ResearchSession } from "@/lib/research/types";
import { SafeMarkdown } from "@/components/notes/SafeMarkdown";
import { AssetDropzone } from "@/components/knowledge/AssetDropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { isWritingTemplateId, type WritingTemplateId, workflowCatalog, workflowCatalogTemplate, writingTemplate } from "@/lib/writing/workflowTemplates";

type Stage = "draft" | "evidence_link" | "human_review" | "export";
type Candidate = { id: string; externalEvidenceId: string; title: string; excerpt: string; authors?: string[]; url?: string; provenance: { sourceLabel: string; retrievedAt: string }; verificationStatus: "verified" | "needs_review" | "rejected"; userConfirmedAt?: string };
type DraftResult = { markdown: string; citations: Array<{ evidenceId: string; marker: string }>; source: "provider" | "deterministic" | "restored"; checkpointId: string; stage: Stage; templateId: WritingTemplateId; assetIds?: string[] };
type Preset = { id: string; name: string; providerId: string; model: string; temperature: number; maxTokens: number };
type StepState = "idle" | "running" | "done" | "paused" | "error";
type LogEntry = { at: string; message: string; tone?: "normal" | "warning" | "success" };
// 完整 session collection 保留：工作台必须允许用户切换全部私有研究会话。

const categories: Array<{ id: "research" | "academic" | "assets"; label: string }> = [
  { id: "research", label: "研究发现" }, { id: "academic", label: "学术写作" },
  { id: "assets", label: "已有资料" },
];
const stageLabel: Record<string, string> = { evidence: "材料", verified_sources: "证据", outline: "提纲", draft: "初稿", evidence_link: "证据回链", human_review: "人工复核", export: "已导出" };

function writingError(response: Response, data: { error?: { message?: string } }, fallback: string) {
  if (response.status === 503) return "写作模型服务尚未配置；可以先用可追溯的本地草稿，或去设置接入模型。";
  return data.error?.message ?? fallback;
}
function nowLabel() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function selectedWorkflowOptions(language: string, citationStyle: string, tone: string, customRequirements: string, enableCheckpoints: boolean, improvementLoop: boolean) {
  const options = { language, citationStyle, tone, customRequirements, enableCheckpoints, improvementLoop };
  const isDefault = language === "auto" && citationStyle === "evidence_marker" && tone === "academic" && !customRequirements && !enableCheckpoints && !improvementLoop;
  return isDefault ? {} : { options };
}

export default function WritingPage() {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [category, setCategory] = useState<"research" | "academic" | "assets">("research");
  const [catalogId, setCatalogId] = useState("evidence_section");
  const [, setTemplateId] = useState<WritingTemplateId>("evidence_section");
  const [workflowQuery, setWorkflowQuery] = useState("");
  const [workflowPresetId, setWorkflowPresetId] = useState("");
  const [stepPresets, setStepPresets] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState("");
  const [tone, setTone] = useState<"academic" | "concise" | "explanatory">("academic");
  const [language, setLanguage] = useState<"zh" | "en" | "auto">("auto");
  const [citationStyle, setCitationStyle] = useState<"evidence_marker" | "apa" | "gb7714">("evidence_marker");
  const [customRequirements, setCustomRequirements] = useState("");
  const [enableCheckpoints, setEnableCheckpoints] = useState(false);
  const [improvementLoop, setImprovementLoop] = useState(false);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [draftText, setDraftText] = useState("");
  const [activeStep, setActiveStep] = useState("setup");
  const [stepState, setStepState] = useState<Record<string, StepState>>({ setup: "idle", materials: "idle", evidence: "idle", outline: "idle", draft: "idle", review: "idle", export: "idle" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  // 文献综述在研究工作区完成；这里仍保留底层模板以恢复历史草稿，但不再作为写作台入口。
  const selectedCatalog = workflowCatalogTemplate(catalogId === "literature_review" ? "evidence_section" : catalogId);
  const runnerTemplateId = selectedCatalog.runnerTemplateId;
  const template = writingTemplate(runnerTemplateId);
  const visibleCatalog = workflowCatalog.filter((item) => item.id !== "literature_review" && item.category === category && (!workflowQuery.trim() || `${item.name} ${item.description} ${item.stages.join(" ")}`.toLocaleLowerCase().includes(workflowQuery.trim().toLocaleLowerCase())));

  const log = useCallback((message: string, tone: LogEntry["tone"] = "normal") => setLogs((items) => [...items, { at: nowLabel(), message, tone }]), []);
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
    setSession(selected); setResult(null); setDraftText(""); setFocus(selected.writingTopic ?? selected.researchQuestion); setStatus(""); setLogs([]); setSelectedIds(selected.evidenceIds); setStepState((state) => ({ ...state, setup: "done" }));
    try {
      const [sessionResponse, candidateResponse, draftResponse] = await Promise.all([
        fetch(`/api/research/sessions/${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/v3/writing/candidates?sessionId=${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/v3/writing/drafts?sessionId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      ]);
      const fresh = await sessionResponse.json();
      if (sessionResponse.ok) { setSession(fresh.session as ResearchSession); setSelectedIds((fresh.session as ResearchSession).evidenceIds); }
      if (candidateResponse.ok) { const data = await candidateResponse.json(); setCandidates(Array.isArray(data) ? data as Candidate[] : []); }
      if (draftResponse.ok) {
        const draft = await draftResponse.json() as DraftResult | null;
        if (draft) { setResult(draft); setDraftText(draft.markdown); setCatalogId(draft.templateId ?? "evidence_section"); setAssetIds(draft.assetIds ?? []); setActiveStep(draft.stage === "human_review" || draft.stage === "export" ? "review" : "draft"); setStepState({ setup: "done", materials: "done", evidence: "done", outline: "done", draft: "done", review: draft.stage === "human_review" || draft.stage === "export" ? "paused" : "idle", export: draft.stage === "export" ? "done" : "idle" }); log("已恢复服务端保存的写作工件", "success"); }
      }
    } catch { setStatus("无法加载该研究会话的写作状态，请刷新后重试。"); }
  }, [log]);

  useEffect(() => {
    Promise.all([loadSessions(), fetch("/api/v3/model-presets", { cache: "no-store" }).then((response) => response.ok ? response.json() : [])])
      .then(([available, loadedPresets]) => { const requestedSession = new URLSearchParams(window.location.search).get("sessionId"); const initial = available.find((item) => item.id === requestedSession) ?? available[0]; setPresets(Array.isArray(loadedPresets) ? loadedPresets as Preset[] : []); if (initial) void selectSession(initial.id, available); })
      .catch((error) => setStatus(error instanceof Error ? error.message : "无法加载写作工作区。"));
  }, [loadSessions, selectSession]);

  useEffect(() => { const requested = new URLSearchParams(window.location.search).get("template") ?? undefined; if (requested === "literature_review") { setCatalogId("evidence_section"); setCategory("research"); } else if (requested && workflowCatalog.some((item) => item.id === requested && item.id !== "literature_review")) { setCatalogId(requested); setCategory(workflowCatalogTemplate(requested).category); } else if (requested && isWritingTemplateId(requested) && requested !== "literature_review") { setCatalogId(requested); setCategory(requested === "outline" || requested === "source_to_paper" ? "academic" : "research"); } }, []);
  function setStep(id: string, state: StepState) { setStepState((current) => ({ ...current, [id]: state })); }

  async function deleteSession(item: ResearchSession) {
    if (!window.confirm(`确认删除“${item.writingTopic ?? item.researchQuestion}”？相关写作工件、证据篮和工作台状态会一并删除。`)) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/research/sessions/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "删除失败");
      const available = await loadSessions();
      const next = available.find((candidate) => candidate.id !== item.id) ?? available[0];
      if (next) await selectSession(next.id, available);
      else {
        setSession(null); setCandidates([]); setSelectedIds([]); setResult(null); setDraftText(""); setLogs([]);
      }
      setStatus("记录及其写作工件已删除。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "删除失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  async function discover() {
    if (!session) return;
    setBusy(true); setStatus(""); setStep("evidence", "running"); log("通过联邦馆藏建立候选证据…");
    try {
      const response = await fetch("/api/v3/writing/candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, researchQuestion: session.researchQuestion }) });
      const data = await response.json(); if (!response.ok) throw new Error(writingError(response, data, "候选检索失败"));
      const discovered = Array.isArray(data.candidates) ? data.candidates as Candidate[] : [];
      setCandidates(discovered); setStep("evidence", "done"); setStatus(`已建立 ${discovered.length} 条候选文献；请逐条核验后加入证据篮。`); log(`得到 ${discovered.length} 条带来源的候选`, "success");
    } catch (error) { setStep("evidence", "error"); setStatus(error instanceof Error ? error.message : "候选检索失败，请稍后重试。"); log("候选检索失败", "warning"); }
    finally { setBusy(false); }
  }

  async function confirm(candidate: Candidate) {
    if (!session || candidate.verificationStatus === "verified") return;
    setBusy(true);
    try {
      const response = await fetch("/api/v3/writing/candidates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, evidenceId: candidate.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(writingError(response, data, "这条候选缺少可核验来源或作者信息"));
      setCandidates((items) => items.map((item) => item.id === candidate.id ? data as Candidate : item)); setSelectedIds((ids) => [...new Set([...ids, (data as Candidate).externalEvidenceId])]);
      const available = await loadSessions(); await selectSession(session.id, available); setStatus("已确认并加入当前研究会话的证据篮。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "候选确认失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  const verified = useMemo(() => candidates.filter((candidate) => candidate.verificationStatus === "verified"), [candidates]);
  const selectedVerified = verified.filter((candidate) => selectedIds.includes(candidate.externalEvidenceId));

  async function runWorkflow() {
    if (!session || !focus.trim() || selectedVerified.length < 3) { setStatus("请先选择研究会话，确认至少三条证据，并填写任务说明。"); setActiveStep("evidence"); return; }
    if (paused) { setPaused(false); setStatus("工作流已继续；请完成当前检查点后再推进。"); log("从检查点继续执行", "success"); return; }
    setBusy(true); setStatus(""); setActiveStep("materials"); setStep("materials", "running"); setStep("evidence", "running"); setStep("outline", "running"); setStep("draft", "running"); log(`开始运行「${template.name}」`); log(`上下文：${selectedVerified.length} 条已确认文献，${assetIds.length} 个附加资料`);
    try {
      setStep("materials", "done"); log("材料清单已锁定，临时资料不会离开当前工作区");
      const response = await fetch("/api/v3/writing/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, focus: focus.trim(), evidenceIds: selectedVerified.map((item) => item.externalEvidenceId), ...(assetIds.length ? { assetIds } : {}), templateId: runnerTemplateId, ...selectedWorkflowOptions(language, citationStyle, tone, customRequirements, enableCheckpoints, improvementLoop), ...(workflowPresetId ? { workflowPresetId } : {}), ...(stepPresets.draft ? { stepPresetId: stepPresets.draft } : {}) }) });
      const data = await response.json(); if (!response.ok) throw new Error(writingError(response, data, "草稿生成失败"));
      const draft = { ...(data as DraftResult), templateId: (data as DraftResult).templateId ?? runnerTemplateId, assetIds }; setResult(draft); setDraftText(draft.markdown); void fetch(`/api/research/sessions/${encodeURIComponent(session.id)}/activity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "writing", title: `${selectedCatalog.name} · ${focus.trim()}` }) }); setStep("evidence", "done"); setStep("outline", "done"); setStep("draft", "done"); setActiveStep(enableCheckpoints ? "draft" : "review"); setStatus(draft.source === "provider" ? "模型已生成草稿；请检查每段引用。" : "未配置可用模型，已生成带来源标记的本地草稿。"); log(draft.source === "provider" ? "模型输出通过引用标记校验" : "使用本地可追溯草稿生成器", draft.source === "provider" ? "success" : "warning");
      if (enableCheckpoints) { setPaused(true); setStep("draft", "paused"); log("已在初稿检查点暂停，可继续、反馈后重跑或进入证据回链", "warning"); }
    } catch (error) { setStep("draft", "error"); setStatus(error instanceof Error ? error.message : "草稿生成失败，请稍后重试。"); log("工作流运行失败", "warning"); }
    finally { setBusy(false); }
  }

  async function saveDraft() {
    if (!session || !result || !draftText.trim()) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/v3/writing/drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, content: draftText }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "草稿保存失败");
      setStatus("草稿已保存，后续证据回链和导出会使用这份内容。");
      log("人工编辑内容已保存到服务端", "success");
    } catch (error) { setStatus(error instanceof Error ? error.message : "草稿保存失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  async function rerunWorkflow() {
    if (!session || !result) return;
    setBusy(true); setStatus(""); setPaused(false); setActiveStep("draft"); setStep("draft", "running");
    log("清理当前运行并重跑初稿步骤…", "warning");
    try {
      const response = await fetch("/api/v3/writing/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, focus: focus.trim(), evidenceIds: selectedVerified.map((item) => item.externalEvidenceId), ...(assetIds.length ? { assetIds } : {}), templateId: runnerTemplateId, rerun: true, ...selectedWorkflowOptions(language, citationStyle, tone, customRequirements, enableCheckpoints, improvementLoop), ...(workflowPresetId ? { workflowPresetId } : {}), ...(stepPresets.draft ? { stepPresetId: stepPresets.draft } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(writingError(response, data, "重跑失败"));
      const draft = { ...(data as DraftResult), templateId: (data as DraftResult).templateId ?? runnerTemplateId, assetIds };
      setResult(draft); setDraftText(draft.markdown); setStep("draft", enableCheckpoints ? "paused" : "done"); setPaused(enableCheckpoints); setStatus("已从服务端重跑当前初稿步骤。"); log("重跑完成，新的工件已保存", "success");
    } catch (error) { setStep("draft", "error"); setStatus(error instanceof Error ? error.message : "重跑失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  async function advance(stage: "evidence_link" | "human_review") {
    if (!session || !result) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/v3/writing/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, stage, ...(stage === "human_review" ? { confirmed: true } : {}) }) });
      const data = await response.json(); if (!response.ok) throw new Error(writingError(response, data, "阶段推进失败"));
      setResult((current) => current ? { ...current, stage: data.stage } : current); setPaused(false); setActiveStep(stage === "human_review" ? "review" : "draft"); setStep(stage === "human_review" ? "review" : "draft", stage === "human_review" ? "paused" : "done"); setStatus(stage === "human_review" ? "人工复核已确认，现在可以导出。" : "证据回链已建立，请检查引用后确认人工复核。"); log(stage === "human_review" ? "人工复核完成" : "证据回链完成", "success");
    } catch (error) { setStatus(error instanceof Error ? error.message : "阶段推进失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  async function download() {
    if (!session || !result || !["human_review", "export"].includes(result.stage)) return;
    setBusy(true);
    try { const response = await fetch("/api/v3/writing/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id }) }); if (!response.ok) throw new Error("服务端尚未允许导出，请完成人工复核。"); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${template.id}-draft.md`; anchor.click(); URL.revokeObjectURL(url); setResult((current) => current ? { ...current, stage: "export" } : current); setStep("export", "done"); log("Markdown 工件已导出", "success"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "导出失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-[1440px] space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="flex items-center gap-2 font-display text-xl text-ivory"><FileText className="h-5 w-5 text-copper" />写作工作台</h1><p className="mt-1 text-sm text-steel">把研究工作区选定的证据带入可恢复的写作、复核与导出流程。</p></div><Link href="/research" className="text-xs text-pulse hover:underline">返回研究工作区</Link></header>
    {status && <p role="status" className="border border-copper/40 bg-copper-faint/30 p-3 text-sm text-copper">{status}</p>}
    <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)_300px]">
      <aside className="space-y-3"><Panel><PanelHeader icon={ListChecks} title="工作流" accent="cyan" /><PanelBody className="space-y-1.5"><Button size="sm" variant="solid" className="w-full" onClick={() => { setResult(null); setDraftText(""); setActiveStep("setup"); setPaused(false); setStatus("已开始新建工作流，请按顺序完成配置。"); }}><Sparkles className="h-3.5 w-3.5" />新建工作流</Button><div className="mt-3 space-y-1">{sessions.map((item) => <div key={item.id} className={`flex border ${session?.id === item.id ? "border-pulse bg-pulse-faint/30" : "border-ink-border bg-ink-raise/50 hover:border-pulse/40"}`}><button type="button" onClick={() => void selectSession(item.id, sessions)} className="min-w-0 flex-1 p-2.5 text-left"><span className="block truncate text-xs text-ivory">{item.writingTopic ?? item.researchQuestion}</span><span className="mt-1 block text-[10px] text-steel-dim">{item.evidenceIds.length} 条证据 · {item.searches.length} 次检索</span></button><button type="button" aria-label={`删除 ${item.writingTopic ?? item.researchQuestion}`} title="删除记录" disabled={busy} onClick={() => void deleteSession(item)} className="w-9 shrink-0 border-l border-ink-border text-steel-dim hover:bg-rosewood/10 hover:text-rosewood disabled:opacity-40"><Trash2 className="mx-auto h-3.5 w-3.5" /></button></div>)}</div></PanelBody></Panel><Panel><PanelHeader icon={Flag} title="运行步骤" accent="copper" /><PanelBody className="space-y-1">{[["setup", "任务配置"], ["materials", "材料"], ["evidence", "证据篮"], ["outline", "提纲"], ["draft", "初稿"], ["review", "人工复核"], ["export", "产物"]].map(([id, label]) => <button type="button" key={id} onClick={() => setActiveStep(id)} className={`flex w-full items-center gap-2 border-l-2 px-2 py-2 text-left text-xs ${activeStep === id ? "border-pulse bg-pulse-faint/20 text-pulse" : "border-transparent text-steel"}`}><span className={`h-1.5 w-1.5 rounded-full ${stepState[id] === "done" ? "bg-pulse" : stepState[id] === "paused" ? "bg-copper" : stepState[id] === "error" ? "bg-rosewood" : "bg-ink-edge"}`} />{label}<ChevronRight className="ml-auto h-3 w-3 opacity-50" /></button>)}</PanelBody></Panel></aside>
      <main className="space-y-4">
        <Panel><PanelHeader icon={Settings2} title="新建工作流 · 任务与模板" accent="cyan" right={session ? <Badge tone="steel">{session.researchQuestion}</Badge> : undefined} /><PanelBody className="space-y-4"><div className="grid gap-3 md:grid-cols-[1fr_1fr]"><label className="block text-xs text-steel">研究会话<select value={session?.id ?? ""} onChange={(event) => void selectSession(event.target.value, sessions)} className="mt-1 h-10 w-full border border-ink-border bg-ink-raise px-3 text-sm text-ivory"><option value="">选择会话</option>{sessions.map((item) => <option key={item.id} value={item.id}>{item.writingTopic ?? item.researchQuestion}</option>)}</select></label><label className="block text-xs text-steel">任务标题 / 焦点<Input value={focus} onChange={(event) => setFocus(event.target.value)} placeholder={template.focusPlaceholder} /></label></div><div><div className="mb-2 flex flex-wrap items-center gap-1 border-b border-ink-border">{categories.map((item) => <button type="button" key={item.id} onClick={() => { setCategory(item.id); setWorkflowQuery(""); }} className={`border-b-2 px-3 py-2 text-xs ${category === item.id ? "border-pulse text-pulse" : "border-transparent text-steel"}`}>{item.label}</button>)}<input value={workflowQuery} onChange={(event) => setWorkflowQuery(event.target.value)} placeholder="筛选工作流" aria-label="筛选工作流" className="ml-auto h-7 w-36 border border-ink-border bg-ink-raise px-2 text-[11px] text-ivory outline-none focus:border-pulse/60" /></div><div className="mb-2 flex items-center justify-between text-[10px] text-steel-dim"><span>{visibleCatalog.length} 个工作流</span><span>按模板、阶段和产物选择</span></div><div className="grid gap-2 sm:grid-cols-2">{visibleCatalog.map((item) => <button type="button" key={item.id} onClick={() => { setCatalogId(item.id); setTemplateId(item.runnerTemplateId); }} className={`flex min-h-28 items-start gap-3 border p-3 text-left ${catalogId === item.id ? "border-pulse bg-pulse-faint/25" : "border-ink-border bg-ink-raise/50 hover:border-ink-edge"}`}><span className="mt-0.5 text-lg text-copper">{item.category === "assets" ? "◈" : item.category === "academic" ? "§" : "✦"}</span><span className="min-w-0"><strong className="block text-sm text-ivory">{item.name}</strong><small className="mt-1 block text-xs leading-relaxed text-steel">{item.description}</small><small className="mt-2 block text-[10px] text-steel-dim">{item.stages.length} 个阶段 · {item.checkpoints} 个检查点 · {item.outputs.slice(0, 2).join(" · ")}</small><small className={`mt-1 block text-[10px] ${item.availability === "ready" ? "text-pulse" : "text-copper"}`}>{item.availability === "ready" ? "当前引擎可运行" : "证据写作降级运行"}</small></span></button>)}{!visibleCatalog.length && <p className="col-span-full py-6 text-center text-xs text-steel-dim">没有匹配的工作流。</p>}</div></div><p className="border-l-2 border-pulse/50 pl-3 text-xs leading-relaxed text-steel">{selectedCatalog.name}：{selectedCatalog.description} · 实际执行将使用 {template.name} 证据引擎，复杂的本地代码、图表和 PDF 产物会明确标为待接入能力。</p></PanelBody></Panel>
         <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><Panel><PanelHeader icon={Upload} title="材料与证据" accent="copper" right={<Button size="sm" loading={busy} disabled={!session} onClick={discover}><Search className="h-3.5 w-3.5" />发现候选</Button>} /><PanelBody className="space-y-3"><AssetDropzone compact sessionId={session?.id} selectedIds={assetIds} onSelectionChange={setAssetIds} /><div className="border-t border-ink-border pt-3"><div className="flex items-center justify-between"><p className="text-xs text-steel">已确认证据 · {selectedVerified.length} 条</p><span className="font-mono text-[10px] text-steel-dim">需要至少 3 条</span></div><div className="mt-2 max-h-72 space-y-2 overflow-y-auto">{candidates.map((candidate) => <div key={candidate.id} className="border border-ink-border bg-ink-raise/50 p-2.5"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="text-xs leading-relaxed text-ivory">{candidate.title}</p><p className="mt-1 text-[10px] text-steel-dim">{candidate.authors?.join(" · ") || "作者待核验"} · {candidate.provenance.sourceLabel}</p></div>{candidate.verificationStatus === "verified" ? <Badge tone="cyan"><Check className="h-3 w-3" />已确认</Badge> : <Button size="sm" disabled={busy} onClick={() => void confirm(candidate)}>确认</Button>}</div>{candidate.verificationStatus !== "verified" && <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-steel">{candidate.excerpt}</p>}{candidate.url && <a href={candidate.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-[10px] text-pulse hover:underline">打开来源</a>}</div>)}{!candidates.length && <p className="py-5 text-center text-xs text-steel-dim">先点击“发现候选”，再把可核验来源加入证据篮。</p>}</div></div></PanelBody></Panel><Panel><PanelHeader icon={Settings2} title="参数与模型" accent="cyan" /><PanelBody className="space-y-3"><label className="block text-xs text-steel">输出语言<select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} className="mt-1 h-9 w-full border border-ink-border bg-ink-raise px-2 text-xs text-ivory"><option value="auto">跟随材料</option><option value="zh">中文</option><option value="en">英文</option></select></label><label className="block text-xs text-steel">工作流模型<select value={workflowPresetId} onChange={(event) => setWorkflowPresetId(event.target.value)} className="mt-1 h-9 w-full border border-ink-border bg-ink-raise px-2 text-xs text-ivory"><option value="">跟随用户默认</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.model}</option>)}</select></label><label className="block text-xs text-steel">引用格式<select value={citationStyle} onChange={(event) => setCitationStyle(event.target.value as typeof citationStyle)} className="mt-1 h-9 w-full border border-ink-border bg-ink-raise px-2 text-xs text-ivory"><option value="evidence_marker">证据标记 [source]</option><option value="apa">APA（仍保留来源标记）</option><option value="gb7714">GB/T 7714（仍保留来源标记）</option></select></label><label className="block text-xs text-steel">写作语气<select value={tone} onChange={(event) => setTone(event.target.value as typeof tone)} className="mt-1 h-9 w-full border border-ink-border bg-ink-raise px-2 text-xs text-ivory"><option value="academic">学术严谨</option><option value="concise">简洁直白</option><option value="explanatory">解释优先</option></select></label><label className="flex items-center gap-2 text-xs text-steel"><input type="checkbox" checked={enableCheckpoints} onChange={(event) => setEnableCheckpoints(event.target.checked)} className="accent-pulse" /><span>启用人工检查点</span></label><label className="flex items-center gap-2 text-xs text-steel"><input type="checkbox" checked={improvementLoop} onChange={(event) => setImprovementLoop(event.target.checked)} className="accent-pulse" /><span>完成初稿后执行改进循环</span></label><button type="button" onClick={() => setStepPresets((current) => ({ ...current, draft: current.draft !== undefined ? undefined as unknown as string : presets[0]?.id ?? "" }))} className="text-left text-xs text-pulse hover:underline">{stepPresets.draft ? "收起步骤模型" : "为步骤单独指定模型"}</button>{stepPresets.draft !== undefined && <label className="block text-xs text-steel">初稿步骤<select value={stepPresets.draft} onChange={(event) => setStepPresets((current) => ({ ...current, draft: event.target.value }))} className="mt-1 h-9 w-full border border-ink-border bg-ink-raise px-2 text-xs text-ivory"><option value="">跟随工作流模型</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.model}</option>)}</select></label>}<textarea value={customRequirements} onChange={(event) => setCustomRequirements(event.target.value)} rows={4} placeholder="自定义要求、禁用方法、篇幅和格式约束" className="w-full resize-y border border-ink-raise bg-ink-raise p-2 text-xs text-ivory outline-none focus:border-pulse/60" /><Button variant="solid" className="w-full" loading={busy} disabled={!session} onClick={() => void runWorkflow()}>{paused ? <><Play className="h-4 w-4" />从检查点继续</> : <><Sparkles className="h-4 w-4" />运行 {template.name}</>}</Button></PanelBody></Panel></div>
        {result && <Panel><PanelHeader icon={FileText} title="编辑器与预览" accent="copper" right={<div className="flex items-center gap-2"><Badge tone={result.source === "provider" ? "cyan" : "copper"}>{result.source === "provider" ? "模型输出" : result.source === "restored" ? "已恢复" : "本地可追溯"}</Badge><Button size="sm" variant="outline" loading={busy} onClick={() => void saveDraft()} disabled={busy || !draftText.trim()}><Check className="h-3.5 w-3.5" />保存编辑</Button><Button size="sm" onClick={() => void rerunWorkflow()} disabled={busy}><RotateCcw className="h-3.5 w-3.5" />重跑当前步骤</Button></div>} /><PanelBody><div className="grid gap-4 lg:grid-cols-2"><div><div className="mb-2 flex items-center justify-between text-[10px] text-steel-dim"><span>source.md · 可编辑</span><span>{draftText.length.toLocaleString()} 字符</span></div><textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} className="min-h-[380px] w-full resize-y border border-ink-border bg-ink-raise p-3 font-mono text-xs leading-relaxed text-ivory outline-none focus:border-pulse/60" /></div><div className="min-h-[380px] border border-ink-border bg-ink-raise/40 p-4"><div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-steel-dim">live preview · 预览</div><SafeMarkdown markdown={draftText} className="space-y-3 text-sm text-steel" /></div></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-border pt-3"><span className="text-xs text-steel">当前阶段：{stageLabel[result.stage]}</span>{result.stage === "draft" && <Button size="sm" disabled={busy || paused} onClick={() => void advance("evidence_link")}><ChevronRight className="h-3.5 w-3.5" />建立证据回链</Button>}{result.stage === "evidence_link" && <Button size="sm" disabled={busy} onClick={() => void advance("human_review")}><Check className="h-3.5 w-3.5" />确认人工复核</Button>}{(result.stage === "human_review" || result.stage === "export") && <Button size="sm" variant="copper" loading={busy} onClick={download}><Download className="h-3.5 w-3.5" />导出 Markdown</Button>}{paused && <Button size="sm" variant="outline" onClick={() => { setPaused(false); setStep("draft", "done"); setStatus("检查点已通过；现在可以建立证据回链。"); log("用户通过初稿检查点", "success"); }}><Check className="h-3.5 w-3.5" />通过检查点</Button>}</div></PanelBody></Panel>}
      </main>
      <aside className="space-y-3"><Panel><PanelHeader icon={ListChecks} title="运行日志" accent="cyan" right={busy ? <span className="flex items-center gap-1 text-[10px] text-pulse"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pulse" />运行中</span> : paused ? <Badge tone="copper"><Pause className="h-3 w-3" />已暂停</Badge> : undefined} /><PanelBody className="max-h-[420px] space-y-2 overflow-y-auto">{!logs.length && <p className="text-xs text-steel-dim">运行后会在这里显示材料锁定、证据、提纲、生成与检查点事件。</p>}{logs.map((item, index) => <div key={`${item.at}-${index}`} className="flex gap-2 text-[11px]"><span className="shrink-0 font-mono text-[9px] text-steel-dim">{item.at}</span><span className={item.tone === "warning" ? "text-copper" : item.tone === "success" ? "text-pulse" : "text-steel"}>{item.message}</span></div>)}</PanelBody></Panel>{result && <Panel><PanelHeader icon={FileText} title="产物清单" accent="copper" /><PanelBody className="space-y-2 text-xs"><div className="flex items-center justify-between border-b border-ink-border pb-2"><span className="text-steel">draft.md</span><Badge tone="cyan">可审阅</Badge></div><div className="flex items-center justify-between border-b border-ink-border pb-2"><span className="text-steel">citations.json</span><span className="font-mono text-[10px] text-steel-dim">{result.citations.length} 条</span></div><div className="flex items-center justify-between"><span className="text-steel">材料引用</span><span className="font-mono text-[10px] text-steel-dim">{result.assetIds?.length ?? 0} 个</span></div><p className="pt-2 text-[10px] leading-relaxed text-steel-dim">每条事实句都需要落到已确认文献标记；附加资料仅在本次工作流的受限上下文中使用。</p></PanelBody></Panel>}<Panel><PanelHeader icon={Flag} title="检查点" accent="copper" /><PanelBody className="space-y-2 text-xs text-steel"><p>启用后，初稿完成会暂停。你可以通过、反馈后重跑，或停在当前阶段。</p>{paused && <div className="flex items-center gap-2 border border-copper/40 bg-copper-faint/25 p-2 text-copper"><Pause className="h-3.5 w-3.5" />等待人工决定</div>}<Button size="sm" className="w-full" disabled={!result || !paused} onClick={() => { setStatus("已保持在当前检查点，内容仍保留在服务端。"); log("用户保持工作流暂停", "warning"); }}><Pause className="h-3.5 w-3.5" />保持暂停</Button></PanelBody></Panel></aside>
    </div>
  </div>;
}
