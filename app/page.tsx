"use client";
/**
 * 首页 = 知识驾驶舱：
 * 左侧操控台（输入 + 任务/水平 + 探索距离控制器），右侧动态知识星图。
 * 第一屏即可操作，无营销内容。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Search, Compass, Radio, Orbit, BrainCircuit, FileText, Map, NotebookPen, LibraryBig } from "lucide-react";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SerendipitySlider } from "@/components/SerendipitySlider";
import { StarMap } from "@/components/StarMap";
import { cn } from "@/lib/utils";
import { SafeMarkdown } from "@/components/notes/SafeMarkdown";
import { OpenLibraryStarMap } from "@/components/OpenLibraryStarMap";
import type { ResourceCard } from "@/lib/types";

type AgentResult = {
  sessionId: string;
  plan: { queries: Array<{ query: string; purpose: string }> };
  selected: ResourceCard[];
  markdown: string;
  generation: "provider" | "deterministic";
  corpusSize: number;
  noteId: string;
  mapHref: string;
  writingHref: string;
};

const TASKS = [
  { value: "course", label: "课程" },
  { value: "project", label: "项目" },
  { value: "research", label: "研究" },
  { value: "exam", label: "考试" },
  { value: "curiosity", label: "好奇" },
] as const;

const LEVELS = [
  { value: "beginner", label: "初学" },
  { value: "undergraduate", label: "本科" },
  { value: "graduate", label: "研究生" },
  { value: "research", label: "研究者" },
] as const;

const PRESETS = [
  "I want to learn AI Agent for a project",
  "帮我找 Agent Memory 相关的资源",
  "RAG 和信息检索入门",
];

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [taskType, setTaskType] = useState("project");
  const [level, setLevel] = useState("beginner");
  const [slider, setSlider] = useState(50);
  const [launchMode, setLaunchMode] = useState<"agent" | "search">("agent");
  const [output, setOutput] = useState<"search_brief" | "summary" | "literature_review">("search_brief");
  const [exploreAfterSearch, setExploreAfterSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [atlasMode, setAtlasMode] = useState<"knowledge" | "library">("knowledge");

  async function launch(q?: string) {
    const finalQuery = (q ?? query).trim();
    if (!finalQuery || busy) return;
    setBusy(true);
    setError(null);
    setAgentResult(null);
    try {
      if (launchMode === "agent") {
        const response = await fetch("/api/v3/agent/explore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: finalQuery, taskType, level, output, sliderValue: slider }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? `Agent 探索失败（${response.status}）`);
        setAgentResult(data as AgentResult);
        setBusy(false);
        return;
      }
      const sessionResponse = await fetch("/api/research/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          researchQuestion: finalQuery,
          writingTopic: taskType === "research" ? finalQuery : undefined,
        }),
      });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(session.error?.message ?? `无法创建研究会话（${sessionResponse.status}）`);

      const actionResponse = await fetch(`/api/research/sessions/${encodeURIComponent(session.id)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          nodeId: "topic",
          topic: finalQuery,
          taskType,
          level,
          ...(exploreAfterSearch ? { sliderValue: slider } : {}),
        }),
      });
      const action = await actionResponse.json();
      if (!actionResponse.ok) throw new Error(action.error?.message ?? `检索失败（${actionResponse.status}）`);
      router.push(action.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "检索失败");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
      {/* ---------- 左：操控台 ---------- */}
      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Panel>
            <PanelHeader icon={Compass} title="navigation console · 导航台" accent="cyan" />
            <PanelBody className="space-y-4">
              <div>
                <h1 className="font-display text-xl leading-snug text-ivory">
                  你今天想在图书馆
                  <br />
                  探索什么？
                </h1>
                <p className="mt-1 text-xs leading-relaxed text-steel">
                  我能找到你要的资源，也知道什么时候该带你去一个你从没想过要搜的书架。
                </p>
              </div>

              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && launch()}
                  placeholder="输入主题，例如 AI Agent…"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 border border-ink-border bg-ink-raise/45 p-1" aria-label="探索方式">
                <button type="button" onClick={() => setLaunchMode("agent")} className={cn("flex h-8 items-center justify-center gap-1.5 text-xs", launchMode === "agent" ? "bg-pulse-faint text-pulse" : "text-steel")}><BrainCircuit className="h-3.5 w-3.5" />AI 全量搜索</button>
                <button type="button" onClick={() => setLaunchMode("search")} className={cn("flex h-8 items-center justify-center gap-1.5 text-xs", launchMode === "search" ? "bg-pulse-faint text-pulse" : "text-steel")}><Search className="h-3.5 w-3.5" />直接检索</button>
              </div>

              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-steel-dim">
                    mission
                  </span>
                  {TASKS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTaskType(t.value)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] transition-colors",
                        taskType === t.value
                          ? "border-pulse/60 bg-pulse-faint/40 text-pulse"
                          : "border-ink-border text-steel hover:border-ink-edge hover:text-ivory",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-steel-dim">
                    level
                  </span>
                  {LEVELS.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => setLevel(l.value)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] transition-colors",
                        level === l.value
                          ? "border-copper/60 bg-copper-faint/40 text-copper"
                          : "border-ink-border text-steel hover:border-ink-edge hover:text-ivory",
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {launchMode === "agent" && <div className="space-y-3 border-t border-ink-border pt-3.5">
                <div className="grid grid-cols-3 gap-1 border border-ink-border bg-ink-raise/45 p-1">
                  <button type="button" onClick={() => setOutput("search_brief")} className={cn("flex min-h-9 items-center justify-center gap-1 px-1 text-[10px]", output === "search_brief" ? "bg-copper-faint text-copper" : "text-steel")}><Search className="h-3 w-3" />AI 全量总结</button>
                  <button type="button" onClick={() => setOutput("summary")} className={cn("flex min-h-9 items-center justify-center gap-1 px-1 text-[10px]", output === "summary" ? "bg-copper-faint text-copper" : "text-steel")}><FileText className="h-3 w-3" />资料概要</button>
                  <button type="button" onClick={() => setOutput("literature_review")} className={cn("flex min-h-9 items-center justify-center gap-1 px-1 text-[10px]", output === "literature_review" ? "bg-copper-faint text-copper" : "text-steel")}><NotebookPen className="h-3 w-3" />初步综述</button>
                </div>
                <SerendipitySlider value={slider} onChange={setSlider} />
              </div>}

              {launchMode === "search" && <div className="border-t border-ink-border pt-3.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-steel">
                  <input type="checkbox" checked={exploreAfterSearch} onChange={(event) => setExploreAfterSearch(event.target.checked)} className="h-3.5 w-3.5 accent-pulse" />
                  <Orbit className="h-3.5 w-3.5 text-pulse" />
                  搜索后继续发散探索
                </label>
                {exploreAfterSearch && <div className="mt-3"><SerendipitySlider value={slider} onChange={setSlider} /></div>}
              </div>}

              <Button
                variant="solid"
                size="lg"
                className="w-full"
                loading={busy}
                disabled={!query.trim()}
                onClick={() => launch()}
              >
                <Search className="h-4 w-4" />
                {busy ? (launchMode === "agent" ? "AI 正在拆解目标并检索…" : "定位知识坐标…") : (launchMode === "agent" ? "开始 AI 全量搜索" : "启动检索")}
              </Button>

              {error && <p className="text-xs text-rosewood">{error}</p>}
            </PanelBody>
          </Panel>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Panel>
            <PanelHeader icon={Radio} title="quick signals · 预设信号" />
            <PanelBody className="space-y-1.5 pt-3">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => launch(p)}
                  disabled={busy}
                  className="block w-full truncate rounded-md border border-ink-border/70 bg-ink-raise/50 px-3 py-2 text-left text-xs text-steel transition-colors hover:border-pulse/40 hover:text-ivory disabled:opacity-40"
                >
                  <span className="mr-1.5 font-mono text-[10px] text-pulse/70">»</span>
                  {p}
                </button>
              ))}
            </PanelBody>
          </Panel>
        </motion.div>
      </div>

      {/* ---------- 右：知识星图 ---------- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="relative min-h-[420px] overflow-hidden rounded-lg border border-ink-border bg-ink-panel/60 lg:min-h-[calc(100vh-8.5rem)]"
      >
        <div className="absolute left-3.5 top-3 z-10 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-steel-dim">
            knowledge atlas
          </span>
          <span className="h-px w-10 bg-ink-edge" />
          <span className="font-mono text-[10px] text-pulse/70">
            {atlasMode === "library" ? "open library" : query.trim() ? "signal locked" : "standby"}
          </span>
        </div>
        <div className="absolute right-3 top-3 z-20 flex border border-ink-border bg-ink/90 p-1">
          <button type="button" onClick={() => setAtlasMode("knowledge")} className={cn("flex h-7 items-center gap-1 px-2.5 text-[10px]", atlasMode === "knowledge" ? "bg-pulse-faint text-pulse" : "text-steel")}><Orbit className="h-3 w-3" />知识星区</button>
          <button type="button" onClick={() => setAtlasMode("library")} className={cn("flex h-7 items-center gap-1 px-2.5 text-[10px]", atlasMode === "library" ? "bg-copper-faint text-copper" : "text-steel")}><LibraryBig className="h-3 w-3" />馆藏分类</button>
        </div>
        {atlasMode === "knowledge" ? <StarMap query={query} onPick={(label) => setQuery(label)} /> : <OpenLibraryStarMap onPick={(label) => setQuery(label)} />}
        <div className="pointer-events-none absolute bottom-3 right-3.5 z-10 font-mono text-[9.5px] tracking-wider text-steel-dim">
          {atlasMode === "knowledge" ? "输入主题点亮相关星区 · 点击节点填入" : "点击分类进入子星图 · 点击书目打开 Open Library"}
        </div>
      </motion.div>

      {agentResult && <Panel className="lg:col-span-2">
        <PanelHeader icon={BrainCircuit} title="AI 搜索总结 · 全部候选" accent="cyan" right={<span className="font-mono text-[9px] text-steel-dim">{agentResult.generation === "provider" ? "模型综合" : "可追溯本地综合"}</span>} />
        <PanelBody className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="min-w-0 border border-ink-border bg-ink-raise/35 p-4"><SafeMarkdown markdown={agentResult.markdown} /></div>
          <div className="space-y-4">
            <section><h2 className="mb-2 text-xs text-ivory">AI 拆解出的检索路径</h2><ol className="space-y-2">{agentResult.plan.queries.map((step, index) => <li key={step.query} className="border-l-2 border-pulse/45 pl-3 text-xs text-steel"><strong className="block text-ivory">{index + 1}. {step.query}</strong><span className="text-[10px] text-steel-dim">{step.purpose}</span></li>)}</ol></section>
            <section><h2 className="mb-2 text-xs text-ivory">已扫描 {agentResult.corpusSize} 条 · 按相关性初选 {agentResult.selected.length} 条</h2><p className="mb-2 text-[10px] leading-relaxed text-steel-dim">总结基于所有候选的题名、作者、来源和可用摘要线索；正式引用仍需打开来源逐条核验。</p><div className="max-h-56 space-y-1 overflow-y-auto">{agentResult.selected.map((item) => <div key={item.id} className="flex items-start justify-between gap-2 border-b border-ink-border/70 py-2"><div className="min-w-0"><p className="line-clamp-2 text-xs text-ivory">{item.title}</p><p className="mt-0.5 font-mono text-[9px] text-copper">{item.sourceLabel}</p></div>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener" className="shrink-0 text-[10px] text-pulse">来源</a>}</div>)}</div></section>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <Link href={agentResult.mapHref} className="flex h-9 items-center justify-center gap-1 border border-pulse/45 text-xs text-pulse hover:bg-pulse-faint/30"><Map className="h-3.5 w-3.5" />查看星图</Link>
              <Link href="/notes" className="flex h-9 items-center justify-center gap-1 border border-ink-border text-xs text-steel hover:text-ivory"><NotebookPen className="h-3.5 w-3.5" />已存笔记</Link>
            </div>
          </div>
        </PanelBody>
      </Panel>}
    </div>
  );
}
