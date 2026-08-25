"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ExternalLink, GitBranch, Network, Plus, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ExplorationFeedback, ExplorationRecommendation, WorkbenchState } from "@/lib/workbench/types";
import { buildWorkbenchViewModel, type WorkbenchView } from "@/lib/workbench/viewModel";
import { workbenchResourceLinks } from "@/lib/workbench/projection";

type SourceState = { status: string; degraded: boolean; message?: string; labels: string[] };
type MemoryState = { status: string; snippets: Array<{ sourceId: string }>; preferences: Array<{ id: string }>; message?: string };

export function ExplorationWorkbench({ initialState, initialView = "reading", focusedResourceId }: { initialState: WorkbenchState; initialView?: WorkbenchView; focusedResourceId?: string }) {
  const [state, setState] = useState(initialState);
  const [activeView, setActiveView] = useState<WorkbenchView>(initialView);
  const [recommendations, setRecommendations] = useState<ExplorationRecommendation[]>([]);
  const [source, setSource] = useState<SourceState | null>(null);
  const [memory, setMemory] = useState<MemoryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [edgeDraft, setEdgeDraft] = useState({ source: "", target: "", label: "" });
  const [claimDraft, setClaimDraft] = useState("");
  const [paragraphDraft, setParagraphDraft] = useState("");
  const viewModel = useMemo(() => buildWorkbenchViewModel(state, recommendations), [state, recommendations]);
  const focusedProjection = focusedResourceId ? state.resourceProjections[focusedResourceId] : undefined;
  const focusedLinks = focusedProjection ? workbenchResourceLinks(state.sessionId, focusedProjection) : undefined;

  function change(patch: Partial<WorkbenchState>) { setState((current) => ({ ...current, ...patch })); setDirty(true); }
  function changePlan(patch: Partial<WorkbenchState["readingPlan"]>) {
    change({ readingPlan: { ...state.readingPlan, ...patch } });
  }

  async function generate() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/research/sessions/${encodeURIComponent(state.sessionId)}/recommendations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surpriseLevel: state.surpriseLevel, limit: 20 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "推荐生成失败");
      setRecommendations(data.recommendations); setSource(data.source); setMemory(data.memory);
      setState((current) => ({ ...current, version: data.workbenchVersion ?? current.version,
        resourceProjections: data.resourceProjections ?? current.resourceProjections }));
      setMessage(data.source.degraded ? "来源端口当前降级；没有把外部失败伪装成零结果。" : `已生成 ${data.recommendations.length} 条可解释探索项。`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "推荐生成失败"); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/research/sessions/${encodeURIComponent(state.sessionId)}/workbench`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: state.version, surpriseLevel: state.surpriseLevel,
          readingPlan: state.readingPlan, views: state.views, resourceStates: state.resourceStates, evidenceGraph: state.evidenceGraph }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? "另一窗口已更新工作台，请刷新后重试。" : data.error?.message ?? "保存失败");
      setState(data.workbench); setDirty(false); setMessage(`用户工作层 v${data.workbench.version} 已保存；公共图与 consent 未写入。`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusy(false); }
  }

  async function feedback(recommendationId: string, value: ExplorationFeedback) {
    const response = await fetch(`/api/research/sessions/${encodeURIComponent(state.sessionId)}/recommendations/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recommendationId, feedback: value }),
    });
    const data = await response.json();
    setMessage(response.ok ? "反馈已写入事件端口，没有直接修改长期偏好。" : data.status === "unavailable"
      ? "反馈事件端口未接入；没有静默写入偏好。" : data.error?.message ?? "反馈失败");
  }

  async function continueSearch(item: ExplorationRecommendation) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/research/sessions/${encodeURIComponent(state.sessionId)}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", nodeId: `resource:${encodeURIComponent(item.resourceId)}`, topic: item.title }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "继续搜索失败");
      window.location.href = data.href;
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "继续搜索失败"); setBusy(false); }
  }

  function queue(resourceId: string) {
    const ids = state.readingPlan.orderedResourceIds.includes(resourceId) ? state.readingPlan.orderedResourceIds : [...state.readingPlan.orderedResourceIds, resourceId];
    change({ readingPlan: { ...state.readingPlan, orderedResourceIds: ids,
      estimatedMinutes: recommendations.filter((item) => ids.includes(item.resourceId)).reduce((sum, item) => sum + item.estimatedMinutes, 0) },
      resourceStates: { ...state.resourceStates, [resourceId]: state.resourceStates[resourceId] ?? { status: "queued", tags: [] } } });
  }

  function setResourceStatus(resourceId: string, status: "queued" | "reading" | "complete") {
    const previous = state.resourceStates[resourceId] ?? { status: "queued" as const, tags: [] };
    const completed = status === "complete"
      ? [...new Set([...state.readingPlan.completedResourceIds, resourceId])]
      : state.readingPlan.completedResourceIds.filter((id) => id !== resourceId);
    change({ resourceStates: { ...state.resourceStates, [resourceId]: { ...previous, status } },
      readingPlan: { ...state.readingPlan, completedResourceIds: completed } });
  }

  function addPersonalEdge() {
    if (!edgeDraft.source.trim() || !edgeDraft.target.trim() || !edgeDraft.label.trim()) return;
    const current = state.views.concept;
    change({ views: { ...state.views, concept: { ...current, personalEdges: [...current.personalEdges, { id: crypto.randomUUID(), ...edgeDraft }] } } });
    setEdgeDraft({ source: "", target: "", label: "" });
  }

  function addClaim() {
    if (!claimDraft.trim()) return;
    change({ evidenceGraph: { ...state.evidenceGraph, claims: [...state.evidenceGraph.claims, { id: crypto.randomUUID(), text: claimDraft.trim() }] } });
    setClaimDraft("");
  }

  function addEvidence(item: ExplorationRecommendation) {
    if (state.evidenceGraph.evidence.some((evidence) => evidence.resourceId === item.resourceId)) return;
    change({ evidenceGraph: { ...state.evidenceGraph, evidence: [...state.evidenceGraph.evidence,
      { id: crypto.randomUUID(), resourceId: item.resourceId, label: item.title }] } });
  }

  function linkEvidence(claimId: string, evidenceId: string, role: "supports" | "refutes" | "background" | "to_verify") {
    change({ evidenceGraph: { ...state.evidenceGraph, links: [...state.evidenceGraph.links,
      { id: crypto.randomUUID(), claimId, evidenceId, role }] } });
  }

  function addParagraph() {
    if (!paragraphDraft.trim()) return;
    change({ evidenceGraph: { ...state.evidenceGraph, draftParagraphs: [...state.evidenceGraph.draftParagraphs, {
      id: crypto.randomUUID(), text: paragraphDraft.trim(),
      sourceRefs: state.evidenceGraph.evidence.map((item) => ({ resourceId: item.resourceId, noteId: item.noteId })),
    }] } });
    setParagraphDraft("");
  }

  return <div className="space-y-4">
    <section className="rounded-lg border border-ink-border bg-ink-panel p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-steel">意外度
          <select value={state.surpriseLevel} onChange={(event) => change({ surpriseLevel: event.target.value as WorkbenchState["surpriseLevel"] })} className="ml-2 rounded border border-ink-border bg-ink-raise px-2 py-1.5 text-ivory">
            <option value="low">低 · 80/20/0</option><option value="medium">中 · 60/30/10</option><option value="high">高 · 40/35/25</option>
          </select>
        </label>
        <Button variant="solid" loading={busy} onClick={generate}><Sparkles className="h-4 w-4" />生成探索项</Button>
        <Button className="ml-auto" loading={busy} disabled={!dirty} onClick={save}><Save className="h-4 w-4" />保存用户层</Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-steel-dim">
        <span>来源：{source ? source.degraded ? "显式降级" : source.labels.join(" / ") || source.status : "尚未请求"}</span>
        <span>记忆：{memory?.status === "available" && memory.snippets.length + memory.preferences.length > 0 ? `已用 ${memory.snippets.length + memory.preferences.length} 条带来源特征` : "无历史记忆模式"}</span>
        <span>版本：v{state.version}</span>
      </div>
      {message && <p role="status" className="mt-2 text-xs text-steel">{message}</p>}
      {focusedResourceId && (focusedProjection && focusedLinks
        ? <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded border border-pulse/30 bg-pulse-faint px-3 py-2 text-xs text-steel"><span>当前定位：<strong className="text-ivory">{focusedProjection.title}</strong></span><Link href={focusedLinks.map} className="text-pulse">在星图重新聚焦</Link>{focusedLinks.catalog && <a href={focusedLinks.catalog} rel="noreferrer" className="text-copper">打开来源馆藏</a>}</div>
        : <p role="alert" className="mt-3 rounded border border-copper/40 px-3 py-2 text-xs text-copper">目标资源 {focusedResourceId} 已失效；请重新生成探索项以恢复投影。</p>)}
    </section>

    <nav className="grid grid-cols-3 gap-2">{viewModel.tabs.map((tab) => <button key={tab.id} onClick={() => setActiveView(tab.id)} className={cn("rounded border px-3 py-2 text-xs", activeView === tab.id ? "border-pulse bg-pulse-faint text-pulse" : "border-ink-border bg-ink-panel text-steel")}>{tab.label} · {tab.count}</button>)}</nav>

    {activeView === "reading" && <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <section className="space-y-3 rounded-lg border border-ink-border bg-ink-panel p-4">
        <h2 className="flex items-center gap-2 font-display text-base text-ivory"><BookOpen className="h-4 w-4 text-pulse" />阅读计划</h2>
        <label className="block text-xs text-steel">目标<Input value={state.readingPlan.goal} onChange={(event) => changePlan({ goal: event.target.value })} /></label>
        <label className="block text-xs text-steel">预计时长（分钟）<Input type="number" value={state.readingPlan.estimatedMinutes} onChange={(event) => changePlan({ estimatedMinutes: Number(event.target.value) })} /></label>
        <label className="block text-xs text-steel">完成定义<textarea value={state.readingPlan.completionDefinition} onChange={(event) => changePlan({ completionDefinition: event.target.value })} className="mt-1 min-h-20 w-full rounded border border-ink-border bg-ink-raise p-2 text-xs text-ivory" /></label>
        <label className="block text-xs text-steel">下一步动作<textarea value={state.readingPlan.nextAction} onChange={(event) => changePlan({ nextAction: event.target.value })} className="mt-1 min-h-20 w-full rounded border border-ink-border bg-ink-raise p-2 text-xs text-ivory" /></label>
        <ol className="space-y-1 text-xs text-steel">{state.readingPlan.orderedResourceIds.map((id, index) => <li key={id}>{index + 1}. {recommendations.find((item) => item.resourceId === id)?.title ?? id}</li>)}</ol>
      </section>
      <section className="space-y-3">{recommendations.map((item) => <article key={item.id} className="rounded-lg border border-ink-border bg-ink-panel p-4">
        <div className={cn("flex gap-3 rounded", focusedResourceId === item.resourceId && "ring-1 ring-pulse")}><div className="min-w-0 flex-1"><div className="font-mono text-[9px] uppercase text-copper">{item.band} · {item.provenance.sourceLabel}</div><h3 className="text-sm text-ivory">{item.title}</h3></div><Link href={viewModel.resources.find((resource) => resource.id === item.resourceId)?.href ?? "#"} className="text-pulse" aria-label="在会话星图打开"><ExternalLink className="h-4 w-4" /></Link></div>
        <dl className="mt-2 grid gap-1 text-[11px] text-steel"><div><dt className="inline text-pulse">关系：</dt><dd className="inline">{item.explanation.relationship}</dd></div><div><dt className="inline text-pulse">桥梁：</dt><dd className="inline">{item.explanation.bridge}</dd></div><div><dt className="inline text-pulse">难度：</dt><dd className="inline">{item.explanation.difficulty}</dd></div><div><dt className="inline text-pulse">新增价值：</dt><dd className="inline">{item.explanation.newValue}</dd></div></dl>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => queue(item.resourceId)}><Plus className="h-3 w-3" />加入计划</Button><Button size="sm" onClick={() => setResourceStatus(item.resourceId, "complete")}><Check className="h-3 w-3" />完成</Button>{state.resourceProjections[item.resourceId] && (() => { const links = workbenchResourceLinks(state.sessionId, state.resourceProjections[item.resourceId]); return <><button className="text-[10px] text-pulse" onClick={() => continueSearch(item)}>继续搜索</button><Link className="text-[10px] text-pulse" href={links.note}>笔记入口</Link><Link className="text-[10px] text-pulse" href={links.draft}>草稿入口</Link>{links.catalog && <a className="text-[10px] text-copper" href={links.catalog} rel="noreferrer">来源馆藏</a>}</>; })()}{(["useful", "too_far", "too_hard"] as const).map((value) => <button key={value} onClick={() => feedback(item.id, value)} className="rounded border border-ink-border px-2 py-1 text-[10px] text-steel hover:text-pulse">{value === "useful" ? "有用" : value === "too_far" ? "太远" : "太难"}</button>)}</div>
      </article>)}</section>
    </div>}

    {activeView === "concept" && <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="rounded-lg border border-ink-border bg-ink-panel p-4"><h2 className="flex items-center gap-2 font-display text-base text-ivory"><Network className="h-4 w-4 text-pulse" />概念图用户层</h2><div className="mt-3 grid gap-2 md:grid-cols-2">{recommendations.map((item) => <div key={item.id} className="rounded border border-ink-border p-3"><div className="text-xs text-ivory">{item.title}</div><div className="mt-1 text-[10px] text-steel">{item.conceptIds.join(" · ") || "无来源概念标签"}</div></div>)}</div></div>
      <div className="space-y-2 rounded-lg border border-ink-border bg-ink-panel p-4"><h3 className="text-sm text-ivory">新增个人边</h3>{(["source", "target", "label"] as const).map((key) => <Input key={key} value={edgeDraft[key]} placeholder={key} onChange={(event) => setEdgeDraft((current) => ({ ...current, [key]: event.target.value }))} />)}<Button onClick={addPersonalEdge}><Plus className="h-3 w-3" />添加到用户层</Button>{state.views.concept.personalEdges.map((edge) => <p key={edge.id} className="text-xs text-steel">{edge.source} —{edge.label}→ {edge.target}</p>)}</div>
    </section>}

    {activeView === "evidence" && <section className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-2 rounded-lg border border-ink-border bg-ink-panel p-4"><h2 className="font-display text-base text-ivory">主张</h2><textarea value={claimDraft} onChange={(event) => setClaimDraft(event.target.value)} className="min-h-20 w-full rounded border border-ink-border bg-ink-raise p-2 text-xs text-ivory" /><Button onClick={addClaim}><Plus className="h-3 w-3" />添加主张</Button>{state.evidenceGraph.claims.map((claim) => <p key={claim.id} className="rounded border border-ink-border p-2 text-xs text-steel">{claim.text}</p>)}</div>
      <div className="space-y-2 rounded-lg border border-ink-border bg-ink-panel p-4"><h2 className="font-display text-base text-ivory">证据与关系</h2>{recommendations.map((item) => <button key={item.id} onClick={() => addEvidence(item)} className="block w-full rounded border border-ink-border p-2 text-left text-xs text-steel hover:text-pulse">+ {item.title}</button>)}{state.evidenceGraph.evidence.map((evidence) => <div key={evidence.id} className="rounded border border-ink-border p-2"><p className="text-xs text-ivory">{evidence.label}</p>{state.evidenceGraph.claims.map((claim) => <div key={claim.id} className="mt-1 flex flex-wrap gap-1">{(["supports", "refutes", "background", "to_verify"] as const).map((role) => <button key={role} onClick={() => linkEvidence(claim.id, evidence.id, role)} className="text-[9px] text-pulse">{role}</button>)}</div>)}</div>)}</div>
      <div className="space-y-2 rounded-lg border border-ink-border bg-ink-panel p-4"><h2 className="flex items-center gap-2 font-display text-base text-ivory"><GitBranch className="h-4 w-4 text-pulse" />草稿反链</h2><textarea value={paragraphDraft} onChange={(event) => setParagraphDraft(event.target.value)} className="min-h-24 w-full rounded border border-ink-border bg-ink-raise p-2 text-xs text-ivory" /><Button onClick={addParagraph}>保存段落与当前证据反链</Button>{state.evidenceGraph.draftParagraphs.map((paragraph) => <div key={paragraph.id} className="rounded border border-ink-border p-2"><p className="text-xs text-ivory">{paragraph.text}</p><div className="mt-1 flex flex-wrap gap-2">{paragraph.sourceRefs.map((ref) => <Link key={`${ref.resourceId}:${ref.noteId ?? ""}`} href={`/research/${encodeURIComponent(state.sessionId)}/map?sessionId=${encodeURIComponent(state.sessionId)}&resourceId=${encodeURIComponent(ref.resourceId)}`} className="text-[10px] text-pulse">↩ {ref.noteId ?? ref.resourceId}</Link>)}</div></div>)}</div>
    </section>}
  </div>;
}
