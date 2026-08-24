"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Map, Plus, RotateCcw } from "lucide-react";
import type { ResearchSession } from "@/lib/research/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export default function ResearchPage() {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [question, setQuestion] = useState("");
  const [writingTopic, setWritingTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const response = await fetch("/api/research/sessions", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "无法读取研究会话");
      setSessions(data.sessions);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法读取研究会话"); }
  }

  useEffect(() => { void load(); }, []);

  async function create() {
    if (!question.trim()) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/research/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ researchQuestion: question, writingTopic: writingTopic || undefined }),
      });
      const session = await response.json();
      if (!response.ok) throw new Error(session.error?.message ?? "创建失败");
      window.location.href = `/research/${session.id}/map`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建失败"); setBusy(false); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Panel>
        <PanelHeader icon={Plus} title="new research session · 新研究会话" accent="cyan" />
        <PanelBody className="space-y-4">
          <div>
            <h1 className="font-display text-xl text-ivory">把一次检索变成可恢复的研究工作区</h1>
            <p className="mt-1 text-xs leading-relaxed text-steel">最近搜索、证据、虫洞与个人注释会汇入同一张私有工作图。</p>
          </div>
          <label className="block space-y-1.5 text-xs text-steel">
            研究问题
            <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：混合检索如何改善 RAG 的召回率？" />
          </label>
          <label className="block space-y-1.5 text-xs text-steel">
            写作主题（可选）
            <Input value={writingTopic} onChange={(event) => setWritingTopic(event.target.value)} placeholder="例如：RAG 检索质量评估" />
          </label>
          <Button variant="solid" className="w-full" loading={busy} disabled={!question.trim()} onClick={create}>
            <Map className="h-4 w-4" /> 创建并打开星图
          </Button>
          {error && <p role="alert" className="text-xs text-rosewood">{error}</p>}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader icon={BookOpen} title="recent workspaces · 最近工作区" right={<Button size="sm" onClick={load}><RotateCcw className="h-3 w-3" />刷新</Button>} />
        <PanelBody className="space-y-2">
          {sessions.length === 0 && !error && <div className="rounded-md border border-dashed border-ink-edge p-8 text-center text-sm text-steel-dim">还没有研究会话。左侧创建后，主题节点会成为工作图的起点。</div>}
          {sessions.map((session) => (
            <Link key={session.id} href={`/research/${session.id}/map`} className="block rounded-md border border-ink-border bg-ink-raise/50 p-3 transition-colors hover:border-pulse/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm text-ivory">{session.writingTopic ?? session.researchQuestion}</h2>
                  {session.writingTopic && <p className="mt-1 truncate text-xs text-steel">{session.researchQuestion}</p>}
                </div>
                <span className="shrink-0 font-mono text-[9px] text-steel-dim">v{session.personalGraph.version}</span>
              </div>
              <div className="mt-2 flex gap-3 font-mono text-[9px] uppercase tracking-wider text-steel-dim">
                <span>{session.interactionIds.length} searches</span><span>{session.evidenceIds.length} evidence</span><span>{new Date(session.updatedAt).toLocaleString()}</span>
              </div>
            </Link>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
