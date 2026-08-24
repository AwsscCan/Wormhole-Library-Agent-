"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Sparkles } from "lucide-react";
import { SafeMarkdown } from "@/components/notes/SafeMarkdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

type DraftResult = { markdown: string; citations: Array<{ evidenceId: string; marker: string }>; source: "provider" | "deterministic"; checkpointId: string; missingEvidence?: string[] };

function friendlyError(response: Response) {
  if (response.status === 503) return "写作证据端口尚未接入：请在 package 02/03 完成受审计集成后再生成草稿。";
  if (response.status === 400) return "请确认当前章节至少选择三条已验证证据。";
  return "无法生成草稿；不会以模拟馆藏或星图数据替代。";
}

export default function WritingPage() {
  const [sessionId, setSessionId] = useState("");
  const [focus, setFocus] = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const evidenceIds = useMemo(() => [...new Set(evidenceInput.split(/[\n,]/).map((id) => id.trim()).filter(Boolean))].slice(0, 12), [evidenceInput]);

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
        body: JSON.stringify({ sessionId: sessionId.trim(), focus: focus.trim(), evidenceIds }),
      });
      if (!response.ok) { setStatus(friendlyError(response)); return; }
      setResult(await response.json() as DraftResult);
    } catch {
      setStatus("网络不可用，草稿未生成。");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "evidence-bound-draft.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="mx-auto max-w-5xl space-y-4">
    <header><h1 className="flex items-center gap-2 font-display text-xl text-ivory"><FileText className="h-5 w-5 text-copper" />证据约束写作</h1><p className="mt-1 text-sm text-steel">仅选择本章节使用的有界证据子集；完整 session collection 保留，不在页面截断。</p></header>
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel><PanelHeader icon={Sparkles} title="section · 选择证据" accent="cyan" /><PanelBody className="space-y-3">
        <Input value={sessionId} placeholder="Research session ID" onChange={(event) => setSessionId(event.target.value)} />
        <Input value={focus} maxLength={500} placeholder="当前章节焦点，例如：比较实验方法" onChange={(event) => setFocus(event.target.value)} />
        <label className="block text-xs text-steel" htmlFor="evidence-ids">本章节 evidence IDs（每行或逗号一个）</label>
        <textarea id="evidence-ids" value={evidenceInput} rows={8} placeholder="只粘贴当前章节已验证证据 ID" onChange={(event) => setEvidenceInput(event.target.value)} className="w-full rounded-md border border-ink-border bg-ink-raise p-3 font-mono text-sm text-ivory focus:border-pulse/60 focus:outline-none" />
        <p className="text-xs text-steel">已选择 {evidenceIds.length}/12 条。服务端会基于章节焦点对当前选择进行有界编排，完整 collection 仍保留在 session 中。</p>
        <Button variant="solid" className="w-full" loading={loading} onClick={generate}><Sparkles className="h-4 w-4" />生成有证据草稿</Button>
      </PanelBody></Panel>
      <div className="space-y-4">
        {status && <p className="rounded-md border border-copper/40 bg-copper-faint/30 p-3 text-sm text-copper">{status}</p>}
        {result && <Panel><PanelHeader icon={FileText} title="draft · 可复核草稿" accent="copper" right={<div className="flex items-center gap-2"><Badge tone={result.source === "provider" ? "cyan" : "copper"}>{result.source === "provider" ? "Provider" : "deterministic"}</Badge><Button size="sm" onClick={download}><Download className="h-3.5 w-3.5" />.md</Button></div>} /><PanelBody className="space-y-4"><SafeMarkdown markdown={result.markdown} className="space-y-3 text-sm text-steel" /><div className="border-t border-ink-border pt-3"><p className="font-mono text-[10px] uppercase tracking-widest text-steel-dim">citations · 段落证据标记</p><ul className="mt-2 space-y-1 text-xs text-steel">{result.citations.map((citation) => <li key={`${citation.evidenceId}-${citation.marker}`}><code className="text-pulse">{citation.marker}</code> {citation.evidenceId}</li>)}</ul></div></PanelBody></Panel>}
      </div>
    </div>
  </div>;
}
