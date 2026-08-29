"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Map, Plus, RotateCcw, Sparkles, ArrowRight } from "lucide-react";
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
  const [daily, setDaily] = useState<{ sessionId: string; recommendations: Array<{ id: string; title: string; provenance: { sourceLabel: string }; explanation: { relationship: string }; sourceUrl?: string }>; source: { degraded: boolean; labels: string[] }; cached?: boolean } | null>(null);

  async function load(): Promise<ResearchSession[]> {
    setError(null);
    try {
      const response = await fetch("/api/research/sessions", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "无法读取研究会话");
      setSessions(data.sessions);
      return data.sessions as ResearchSession[];
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法读取研究会话"); }
    return [];
  }

  useEffect(() => {
    void load().then(async (loaded) => {
      let first = loaded[0];
      if (!first) {
        const response = await fetch("/api/research/sessions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ researchQuestion: "当前研究热点与跨学科知识", writingTopic: "每日推荐" }),
        });
        if (response.ok) {
          first = await response.json() as ResearchSession;
          setSessions([first]);
        }
      }
      if (!first) return;
      const recommendationResponse = await fetch(`/api/research/sessions/${encodeURIComponent(first.id)}/recommendations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surpriseLevel: "low", limit: 4 }),
      });
      if (recommendationResponse.ok) setDaily(await recommendationResponse.json());
    }).catch(() => undefined);
  }, []);

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

      {daily && <Panel className="lg:col-span-2">
        <PanelHeader icon={Sparkles} title="today · 今日推荐" accent="copper" right={<Link href={`/research/${encodeURIComponent(daily.sessionId)}/workbench`} className="flex items-center gap-1 text-xs text-pulse hover:underline">打开推荐工作台 <ArrowRight className="h-3.5 w-3.5" /></Link>} />
        <PanelBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {daily.recommendations.map((item) => <article key={item.id} className="border border-ink-border bg-ink-raise/60 p-3">
            <div className="font-mono text-[9px] uppercase text-copper">{item.provenance.sourceLabel}</div>
            <h3 className="mt-1 line-clamp-2 text-sm text-ivory">{item.title}</h3>
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-steel">{item.explanation.relationship}</p>
            {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-[11px] text-pulse hover:underline">打开来源</a>}
          </article>)}
          {!daily.recommendations.length && <p className="text-xs text-steel">今天还没有匹配结果。进入工作台后可以调整发散度重新探索。</p>}
        </PanelBody>
      </Panel>}
    </div>
  );
}
