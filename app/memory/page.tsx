"use client";
/**
 * Memory 页 = 探索偏好仪表盘：
 * 意外度 / 难度 / 跨学科方向 / 社交偏好四块仪表 + 更新流水。
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit, Gauge, Orbit, Users, BookOpen, RotateCcw, History,
} from "lucide-react";
import type { MemoryResponse } from "@/lib/types";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DEMO_USER = "demo-user";

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
  const [data, setData] = useState<MemoryResponse | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/memory?userId=${DEMO_USER}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function reset() {
    setResetting(true);
    try {
      const res = await fetch(`/api/memory?userId=${DEMO_USER}`, { method: "DELETE" });
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
            Agent 不存聊天记录——只把你的反馈编译成结构化偏好。全部内容都在这里，透明可控。
          </p>
        </div>
        <Button variant="danger" size="sm" loading={resetting} onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
          重置 Demo 记忆
        </Button>
      </motion.div>

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
    </div>
  );
}
