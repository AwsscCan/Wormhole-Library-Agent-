"use client";
/**
 * 首页 = 知识驾驶舱：
 * 左侧操控台（输入 + 任务/水平 + 探索距离控制器），右侧动态知识星图。
 * 第一屏即可操作，无营销内容。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Compass, Radio } from "lucide-react";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SerendipitySlider } from "@/components/SerendipitySlider";
import { StarMap } from "@/components/StarMap";
import { cn } from "@/lib/utils";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch(q?: string) {
    const finalQuery = (q ?? query).trim();
    if (!finalQuery || busy) return;
    setBusy(true);
    setError(null);
    try {
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
          sliderValue: slider,
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

              <div className="border-t border-ink-border pt-3.5">
                <SerendipitySlider value={slider} onChange={setSlider} />
              </div>

              <Button
                variant="solid"
                size="lg"
                className="w-full"
                loading={busy}
                disabled={!query.trim()}
                onClick={() => launch()}
              >
                <Search className="h-4 w-4" />
                {busy ? "定位知识坐标…" : "启动探索"}
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
        <div className="pointer-events-none absolute left-3.5 top-3 z-10 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-steel-dim">
            knowledge atlas
          </span>
          <span className="h-px w-10 bg-ink-edge" />
          <span className="font-mono text-[10px] text-pulse/70">
            {query.trim() ? "signal locked" : "standby"}
          </span>
        </div>
        <StarMap query={query} onPick={(label) => setQuery(label)} />
        <div className="pointer-events-none absolute bottom-3 right-3.5 z-10 font-mono text-[9.5px] tracking-wider text-steel-dim">
          输入主题点亮相关星区 · 点击节点填入
        </div>
      </motion.div>
    </div>
  );
}
