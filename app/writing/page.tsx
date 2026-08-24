"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Sparkles } from "lucide-react";
import { SafeMarkdown } from "@/components/notes/SafeMarkdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

type DraftResult = { markdown: string; citations: Array<{ evidenceId: string; marker: string }>; source: "provider" | "deterministic"; checkpointId: string; missingEvidence?: string[] };
type WritingPreset = { id: string; name: string; providerId: string; model: string; temperature: number; maxTokens: number };

function friendlyError(response: Response) {
  if (response.status === 503) return "写作证据端口尚未接入：请在 package 02/03 完成受审计集成后再生成草稿。";
  if (response.status === 400) return "请确认当前章节至少选择三条已验证证据。";
  return "无法生成草稿；不会以模拟馆藏或星图数据替代。";
}

export default function WritingPage() {
  const [sessionId, setSessionId] = useState("");
  const [focus, setFocus] = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [presets, setPresets] = useState<WritingPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetStatus, setPresetStatus] = useState("");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [artifactSessionId, setArtifactSessionId] = useState("");
  const [reviewStage, setReviewStage] = useState<"draft" | "evidence_link" | "human_review">("draft");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const evidenceIds = useMemo(() => [...new Set(evidenceInput.split(/[\n,]/).map((id) => id.trim()).filter(Boolean))].slice(0, 12), [evidenceInput]);

  useEffect(() => {
    let active = true;
    async function loadPresets() {
      try {
        const response = await fetch("/api/v3/model-presets");
        if (!response.ok) throw new Error("preset request failed");
        const loaded = await response.json() as unknown;
        if (active && Array.isArray(loaded)) setPresets(loaded as WritingPreset[]);
      } catch {
        if (active) setPresetStatus("模型预设暂不可用；未选择时仍可使用 deterministic 生成。");
      }
    }
    void loadPresets();
    return () => { active = false; };
  }, []);

  async function generate() {
    if (!sessionId.trim() || !focus.trim() || evidenceIds.length < 3) {
      setStatus("填写 session、章节焦点，并选择至少三条已验证证据。");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/v3/writing/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId.trim(),
          focus: focus.trim(),
          evidenceIds,
          ...(selectedPresetId ? { stepPresetId: selectedPresetId } : {}),
        }),
      });
      if (!response.ok) { setStatus(friendlyError(response)); return; }
      setResult(await response.json() as DraftResult);
      setArtifactSessionId(sessionId.trim());
      setReviewStage("draft");
    } catch {
      setStatus("网络不可用，草稿未生成。");
    } finally {
      setLoading(false);
    }
  }

  async function advanceReview(stage: "evidence_link" | "human_review") {
    if (!result || !artifactSessionId) return;
    setStatus("");
    try {
      const response = await fetch("/api/v3/writing/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: artifactSessionId,
          stage,
          ...(stage === "human_review" ? { confirmed: true } : {}),
        }),
      });
      if (!response.ok) {
        setStatus(stage === "human_review" ? "人工复核确认失败；当前工件不能导出。" : "证据回链失败；当前工件不能进入复核。");
        return;
      }
      setReviewStage(stage);
      setStatus(stage === "human_review" ? "人工复核已明确确认，可以请求服务端导出。" : "证据回链已完成，请人工检查草稿与引用后确认。" );
    } catch {
      setStatus("复核状态无法保存；当前工件不能导出。");
    }
  }

  async function download() {
    if (!result || reviewStage !== "human_review" || !artifactSessionId) return;
    try {
      const response = await fetch("/api/v3/writing/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: artifactSessionId }),
      });
      if (!response.ok) { setStatus("服务端拒绝导出：请确认该工件已完成最新人工复核。"); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "evidence-bound-draft.md";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setStatus("导出失败，请检查网络后重试。");
    }
  }

  return <div className="mx-auto max-w-5xl space-y-4">
    <header><h1 className="flex items-center gap-2 font-display text-xl text-ivory"><FileText className="h-5 w-5 text-copper" />证据约束写作</h1><p className="mt-1 text-sm text-steel">仅选择本章节使用的有界证据子集；完整 session collection 保留，不在页面截断。</p></header>
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel><PanelHeader icon={Sparkles} title="section · 选择证据" accent="cyan" /><PanelBody className="space-y-3">
        <Input value={sessionId} placeholder="Research session ID" onChange={(event) => setSessionId(event.target.value)} />
        <Input value={focus} maxLength={500} placeholder="当前章节焦点，例如：比较实验方法" onChange={(event) => setFocus(event.target.value)} />
        <label className="block text-xs text-steel" htmlFor="writing-preset">本次生成模型预设（可选）</label>
        <select id="writing-preset" value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)} className="w-full rounded-md border border-ink-border bg-ink-raise px-3 py-2 text-sm text-ivory focus:border-pulse/60 focus:outline-none">
          <option value="">未选择 · deterministic</option>
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.model}</option>)}
        </select>
        {presetStatus && <p className="text-xs text-copper">{presetStatus}</p>}
        <label className="block text-xs text-steel" htmlFor="evidence-ids">本章节 evidence IDs（每行或逗号一个）</label>
        <textarea id="evidence-ids" value={evidenceInput} rows={8} placeholder="只粘贴当前章节已验证证据 ID" onChange={(event) => setEvidenceInput(event.target.value)} className="w-full rounded-md border border-ink-border bg-ink-raise p-3 font-mono text-sm text-ivory focus:border-pulse/60 focus:outline-none" />
        <p className="text-xs text-steel">已选择 {evidenceIds.length}/12 条。服务端会基于章节焦点对当前选择进行有界编排，完整 collection 仍保留在 session 中。</p>
        <Button variant="solid" className="w-full" loading={loading} onClick={generate}><Sparkles className="h-4 w-4" />生成有证据草稿</Button>
      </PanelBody></Panel>
      <div className="space-y-4">
        {status && <p className="rounded-md border border-copper/40 bg-copper-faint/30 p-3 text-sm text-copper">{status}</p>}
        {result && <Panel><PanelHeader icon={FileText} title="draft · 可复核草稿" accent="copper" right={<div className="flex items-center gap-2"><Badge tone={result.source === "provider" ? "cyan" : "copper"}>{result.source === "provider" ? "Provider" : "deterministic"}</Badge>{reviewStage === "draft" && <Button size="sm" onClick={() => advanceReview("evidence_link")}>建立证据回链</Button>}{reviewStage === "evidence_link" && <Button size="sm" onClick={() => advanceReview("human_review")}>确认人工复核</Button>}{reviewStage === "human_review" && <Button size="sm" onClick={download}><Download className="h-3.5 w-3.5" />.md</Button>}</div>} /><PanelBody className="space-y-4"><SafeMarkdown markdown={result.markdown} className="space-y-3 text-sm text-steel" /><div className="border-t border-ink-border pt-3"><p className="font-mono text-[10px] uppercase tracking-widest text-steel-dim">citations · 段落证据标记</p><ul className="mt-2 space-y-1 text-xs text-steel">{result.citations.map((citation) => <li key={`${citation.evidenceId}-${citation.marker}`}><code className="text-pulse">{citation.marker}</code> {citation.evidenceId}</li>)}</ul></div></PanelBody></Panel>}
      </div>
    </div>
  </div>;
}
