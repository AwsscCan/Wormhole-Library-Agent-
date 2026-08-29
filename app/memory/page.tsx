"use client";
/**
 * Memory 页 = 探索偏好仪表盘：
 * 意外度 / 难度 / 跨学科方向 / 社交偏好四块仪表 + 更新流水。
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit, Gauge, Orbit, Users, BookOpen, RotateCcw, History,
  Database, Layers3, Search, Sparkles,
} from "lucide-react";
import type { MemoryResponse } from "@/lib/types";
import type { HybridMemoryInsights } from "@/lib/research/memory";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function GaugeBar({
  label,
  value,
  max = 1,
  tone = "cyan",
  display,
}: {
  label: string;
  value: number;
  max?: number;
  tone?: "cyan" | "copper" | "rose";
  display?: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-steel">{label}</span>
        <span
          className={cn(
            "font-mono text-[11.5px] tabular-nums",
            tone === "cyan" && "text-pulse",
            tone === "copper" && "text-copper",
            tone === "rose" && "text-rosewood",
          )}
        >
          {display ?? value.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 h-[4px] overflow-hidden rounded-full bg-ink-border/60">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={cn(
            "h-full rounded-full",
            tone === "cyan" && "bg-pulse shadow-glow-cyan-sm",
            tone === "copper" && "bg-copper",
            tone === "rose" && "bg-rosewood",
          )}
        />
      </div>
    </div>
  );
}

export default function MemoryPage() {
  const [data, setData] = useState<(MemoryResponse & { hybrid: HybridMemoryInsights }) | null>(null);
  const [resetting, setResetting] = useState(false);
  const [query, setQuery] = useState("");
  const [retrieving, setRetrieving] = useState(false);

  const load = useCallback((memoryQuery?: string) => {
    const suffix = memoryQuery?.trim() ? `?query=${encodeURIComponent(memoryQuery.trim())}` : "";
    return fetch(`/api/v3/memory${suffix}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function retrieve() {
    if (!query.trim()) return;
    setRetrieving(true);
    try { await load(query); } finally { setRetrieving(false); }
  }

  async function reset() {
    setResetting(true);
    try {
      const res = await fetch("/api/v3/memory", { method: "DELETE" });
      setData(await res.json());
    } finally {
      setResetting(false);
    }
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-steel-dim">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-pulse" />
        reading memory core…
      </div>
    );
  }

  const m = data.memory;

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl text-ivory">
            <BrainCircuit className="h-5 w-5 text-pulse" />
            记忆核心
          </h1>
          <p className="mt-0.5 text-xs text-steel">
            结构化偏好、行为账本与私有 RAG 片段在这里共同组成可审计的混合记忆。
          </p>
        </div>
        <Button variant="danger" size="sm" loading={resetting} onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
          重置我的记忆
        </Button>
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
        <Panel>
          <PanelHeader icon={Layers3} title="hybrid memory · 三层记忆" accent="cyan" />
          <PanelBody className="space-y-3 pt-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["行为事件", data.hybrid.totals.events, "搜索、阅读、反馈"],
                ["RAG 片段", data.hybrid.totals.snippets, "笔记、摘录、写作"],
                ["长期偏好", data.hybrid.totals.preferences, "跨会话重复行为"],
              ].map(([label, value, detail]) => <div key={String(label)} className="border-l-2 border-pulse/50 bg-ink-raise/50 px-3 py-2"><strong className="block font-mono text-lg text-ivory">{value}</strong><span className="block text-xs text-steel">{label}</span><small className="mt-1 block text-[9px] leading-relaxed text-steel-dim">{detail}</small></div>)}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-ink-border pt-3 text-xs">
              <span className="flex items-center gap-2 text-steel"><Database className="h-3.5 w-3.5 text-pulse" />语义引擎</span>
              <span className={data.hybrid.semantic.degraded ? "text-copper" : "text-pulse"}>{data.hybrid.semantic.provider} · {data.hybrid.semantic.degraded ? "本地降级" : data.hybrid.semantic.status}</span>
            </div>
            {data.hybrid.semantic.degraded
              ? <p className="text-[10px] leading-relaxed text-steel-dim">远程语义服务当前不可用，已自动切换到本地字符语义检索；私有记忆仍可正常召回。</p>
              : data.hybrid.semantic.message && <p className="text-[10px] leading-relaxed text-steel-dim">{data.hybrid.semantic.message}</p>}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader icon={Search} title="private RAG · 召回现场" accent="copper" />
          <PanelBody className="pt-3">
            <div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void retrieve(); }} placeholder="输入概念，查看私有记忆如何被召回" className="h-10 min-w-0 flex-1 border border-ink-border bg-ink-raise px-3 text-sm text-ivory outline-none focus:border-pulse/60" /><Button variant="copper" loading={retrieving} disabled={!query.trim()} onClick={() => void retrieve()}><Search className="h-3.5 w-3.5" />检索记忆</Button></div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-steel-dim"><span>当前查询 · {data.hybrid.retrieval.query}</span><span>{data.hybrid.retrieval.matches.length} 个可追溯命中</span></div>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
              {data.hybrid.retrieval.matches.map((match) => <div key={match.id} className="grid gap-2 border border-ink-border bg-ink-raise/45 p-2.5 sm:grid-cols-[1fr_auto]"><div className="min-w-0"><p className="line-clamp-2 text-xs leading-relaxed text-ivory">{match.text}</p><p className="mt-1 font-mono text-[9px] text-steel-dim">{match.kind} · {match.sourceId} · {match.sessionId}</p></div><div className="flex items-center gap-2 sm:flex-col sm:items-end"><Badge tone={match.matchedVia === "both" ? "cyan" : match.matchedVia === "semantic" ? "copper" : "ivory"}>{match.matchedVia === "both" ? "词法 + 语义" : match.matchedVia === "semantic" ? "语义" : "词法"}</Badge><span className="font-mono text-[10px] text-pulse">{match.score.toFixed(3)}</span></div></div>)}
              {!data.hybrid.retrieval.matches.length && <p className="border border-dashed border-ink-border p-4 text-center text-xs text-steel-dim">当前私有知识中没有可召回片段。保存笔记、摘录或写作内容后会出现在这里。</p>}
            </div>
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <PanelHeader icon={Orbit} title="serendipity · 意外度" accent="cyan" />
          <PanelBody className="space-y-3.5 pt-3">
            <GaugeBar
              label="默认探索距离"
              value={m.serendipity.defaultSlider}
              max={100}
              display={String(m.serendipity.defaultSlider)}
            />
            <div>
              <span className="text-xs text-steel-dim">喜欢的跨学科方向</span>
              <div className="mt-1.5 flex min-h-6 flex-wrap gap-1.5">
                {m.serendipity.likedDomains.length === 0 && (
                  <span className="text-[11px] text-steel-dim">尚未学到 — 去给虫洞反馈</span>
                )}
                {m.serendipity.likedDomains.map((d) => (
                  <Badge key={d} tone="cyan">{d}</Badge>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-steel-dim">回避方向</span>
              <div className="mt-1.5 flex min-h-6 flex-wrap gap-1.5">
                {m.serendipity.dislikedDomains.length === 0 && (
                  <span className="text-[11px] text-steel-dim">无</span>
                )}
                {m.serendipity.dislikedDomains.map((d) => (
                  <Badge key={d} tone="rose">{d}</Badge>
                ))}
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader icon={Gauge} title="difficulty · 难度" accent="copper" />
          <PanelBody className="space-y-3.5 pt-3">
            <GaugeBar label="数学容忍度" value={m.difficulty.mathTolerance} tone="copper" />
            <GaugeBar label="论文密度偏好" value={m.difficulty.paperDensity} tone="copper" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-steel-dim">偏好难度层级</span>
              <Badge tone="copper">{m.difficulty.preferredLevel}</Badge>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader icon={BookOpen} title="reading · 阅读" />
          <PanelBody className="space-y-2.5 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-steel-dim">语言偏好</span>
              <Badge tone="ivory">{m.reading.language}</Badge>
            </div>
            <div className="text-xs">
              <span className="text-steel-dim">资源类型顺序</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {m.reading.resourceTypeOrder.map((t, i) => (
                  <span key={String(t)} className="flex items-center gap-1">
                    {i > 0 && <span className="text-steel-dim">→</span>}
                    <span className="rounded border border-ink-border bg-ink-raise px-1.5 py-0.5 font-mono text-[10px] text-steel">
                      {String(t)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-steel-dim">概览优先</span>
              <span className="font-mono text-[11px] text-ivory">
                {m.reading.summaryFirst ? "ON" : "OFF"}
              </span>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader icon={Users} title="social · 社交匹配" />
          <PanelBody className="space-y-2.5 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-steel-dim">匹配模式</span>
              <Badge tone={m.social.matchingMode === "off" ? "rose" : "cyan"}>
                {m.social.matchingMode}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-steel-dim">匿名优先</span>
              <span className="font-mono text-[11px] text-ivory">
                {m.social.anonymousFirst ? "ON" : "OFF"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-steel-dim">Living Book 加入</span>
              <span className="font-mono text-[11px] text-ivory">
                {m.social.livingBookOptIn ? "已加入" : "未加入"}
              </span>
            </div>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          icon={History}
          title="memory log · 更新流水"
          right={
            <span className="font-mono text-[10px] text-steel-dim">
              {data.recentUpdates.length} events
            </span>
          }
        />
        <PanelBody className="space-y-2 pt-3">
          {data.recentUpdates.length === 0 && (
            <p className="text-xs text-steel-dim">
              还没有记忆更新——去 Explore 页给虫洞一点反馈，这里会实时记录每次编译。
            </p>
          )}
          {data.recentUpdates.map((u, i) => (
            <motion.div
              key={`${u.at}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-md border border-ink-border/70 bg-ink-raise/50 p-2.5"
            >
              <span className="font-mono text-[10px] text-steel-dim">
                {new Date(u.at).toLocaleString()}
              </span>
              <ul className="mt-1 space-y-0.5">
                {u.patches.map((p, j) => (
                  <li key={j} className="flex items-baseline gap-2 text-xs">
                    <code className="shrink-0 font-mono text-[10px] text-pulse/80">{p.key}</code>
                    <span className="min-w-0 text-steel">{p.reason}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </PanelBody>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader icon={Sparkles} title="inferred preferences · 推断偏好" accent="cyan" right={<span className="font-mono text-[10px] text-steel-dim">跨会话证据</span>} />
          <PanelBody className="space-y-2 pt-3">
            {data.hybrid.preferences.map((preference) => <div key={preference.id} className="flex items-center gap-3 border-b border-ink-border/70 pb-2"><span className="min-w-0 flex-1 truncate text-xs text-ivory">{preference.conceptId}</span><span className="text-[10px] text-steel-dim">{preference.evidenceCount} 条证据</span><span className="font-mono text-[10px] text-pulse">{Math.round(preference.confidence * 100)}%</span></div>)}
            {!data.hybrid.preferences.length && <p className="text-xs text-steel-dim">需要同一概念在至少两个研究会话中出现可靠行为，才会形成长期偏好。</p>}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader icon={History} title="learning ledger · 行为账本" accent="copper" right={<span className="font-mono text-[10px] text-steel-dim">最近 {data.hybrid.events.length} 条</span>} />
          <PanelBody className="max-h-64 space-y-2 overflow-y-auto pt-3">
            {data.hybrid.events.map((event) => <div key={event.id} className="grid grid-cols-[72px_1fr_auto] items-start gap-2 text-xs"><Badge tone={event.kind === "feedback" ? "copper" : "ivory"}>{event.kind}</Badge><span className="min-w-0 text-steel">{event.query ?? event.conceptId ?? event.resourceId ?? event.rating ?? "已记录行为"}</span><time className="font-mono text-[9px] text-steel-dim">{new Date(event.at).toLocaleDateString()}</time></div>)}
            {!data.hybrid.events.length && <p className="text-xs text-steel-dim">搜索、阅读、保存、写作和反馈会以来源可追踪的事件进入这里。</p>}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
