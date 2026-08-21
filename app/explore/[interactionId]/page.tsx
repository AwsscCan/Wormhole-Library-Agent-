"use client";
/**
 * Explore 页 = 虫洞航行主视图：
 * 主区域是虫洞路径（发光线条 + 阶段动画），右栏是馆藏 / 记忆面板。
 */
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Landmark, Route, Zap, BrainCircuit, HelpCircle, ArrowLeft,
} from "lucide-react";
import type { MemoryResponse, SearchResponse, WormholesResponse } from "@/lib/types";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResourceCard } from "@/components/ResourceCard";
import { WormholeCard } from "@/components/WormholeCard";
import { SerendipitySlider } from "@/components/SerendipitySlider";

const DEMO_USER = "demo-user";

export default function ExplorePage({
  params,
}: {
  params: Promise<{ interactionId: string }>;
}) {
  const { interactionId } = use(params);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [slider, setSlider] = useState(60);
  const [wormholes, setWormholes] = useState<WormholesResponse | null>(null);
  const [whBusy, setWhBusy] = useState(false);
  const [memory, setMemory] = useState<MemoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/search?interactionId=${interactionId}`)
      .then((r) => {
        if (!r.ok) throw new Error("找不到这次探索记录（服务可能重启过），请回导航台重新出发。");
        return r.json();
      })
      .then(setSearch)
      .catch((e) => setError(e.message));
  }, [interactionId]);

  const refreshMemory = useCallback(() => {
    fetch(`/api/memory?userId=${DEMO_USER}`)
      .then((r) => r.json())
      .then(setMemory)
      .catch(() => {});
  }, []);

  useEffect(refreshMemory, [refreshMemory]);

  async function openWormholes() {
    if (!search || whBusy) return;
    setWhBusy(true);
    try {
      const res = await fetch("/api/wormholes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: DEMO_USER,
          interactionId,
          startConceptIds: search.concepts.map((c) => c.id),
          sliderValue: slider,
          maxPaths: 3,
        }),
      });
      setWormholes(await res.json());
    } finally {
      setWhBusy(false);
    }
  }

  if (error) {
    return (
      <Panel className="mx-auto max-w-lg">
        <PanelBody className="space-y-3 text-center">
          <p className="text-sm text-rosewood">{error}</p>
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-pulse hover:underline">
            <ArrowLeft className="h-3 w-3" /> 回导航台
          </Link>
        </PanelBody>
      </Panel>
    );
  }

  if (!search) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-steel-dim">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-pulse" />
        loading coordinates…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 航行状态条 */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ink-border bg-ink-panel/80 px-4 py-2.5"
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-steel hover:text-pulse"
        >
          <ArrowLeft className="h-3 w-3" /> console
        </Link>
        <span className="h-4 w-px bg-ink-border" />
        <h1 className="min-w-0 flex-1 truncate font-display text-[15px] text-ivory">
          「{search.query}」
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {search.concepts.map((c) => (
            <Badge key={c.id} tone="cyan">{c.name}</Badge>
          ))}
        </div>
        {search.memoryUsed.length > 0 && (
          <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-wider text-steel-dim">
            <BrainCircuit className="h-3 w-3 text-pulse-dim" />
            {search.memoryUsed.join(" · ")}
          </span>
        )}
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        {/* ---------- 主区：虫洞航道 ---------- */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              icon={Zap}
              title="wormhole drive · 虫洞引擎"
              accent="cyan"
              right={
                <span className="font-mono text-[10px] text-steel-dim">
                  {wormholes ? `${wormholes.wormholes.length} paths` : "idle"}
                </span>
              }
            />
            <PanelBody className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <SerendipitySlider value={slider} onChange={setSlider} />
                <Button
                  variant="solid"
                  loading={whBusy}
                  onClick={openWormholes}
                  className="sm:mb-1"
                >
                  <Zap className="h-4 w-4" />
                  {wormholes ? "重新开洞" : "打开虫洞"}
                </Button>
              </div>

              {!wormholes && !whBusy && (
                <p className="text-xs text-steel-dim">
                  调整探索距离，然后点火——路径会从你的主题出发，跨过概念桥，落在真实馆藏上。
                </p>
              )}
            </PanelBody>
          </Panel>

          {wormholes && (
            <div className="space-y-3">
              {wormholes.wormholes.length === 0 && (
                <Panel>
                  <PanelBody>
                    <p className="text-sm text-steel">
                      这个距离下没有可解释的虫洞——试着调整探索距离再开一次。
                    </p>
                  </PanelBody>
                </Panel>
              )}
              {wormholes.wormholes.map((w, i) => (
                <WormholeCard
                  key={w.id}
                  wormhole={w}
                  index={i}
                  interactionId={interactionId}
                  userId={DEMO_USER}
                  onFeedbackDone={refreshMemory}
                />
              ))}

              {wormholes.unknownUnknowns && wormholes.unknownUnknowns.length > 0 && (
                <Panel>
                  <PanelHeader icon={HelpCircle} title="unknown unknowns · 你不知道自己不知道的" accent="copper" />
                  <PanelBody className="space-y-2.5 pt-3">
                    {wormholes.unknownUnknowns.map((u) => (
                      <div
                        key={u.concept.id}
                        className="rounded-md border border-copper/25 bg-copper-faint/20 p-3"
                      >
                        <p className="text-[13px] text-ivory">
                          你大概不会主动搜索：
                          <span className="ml-1 font-display text-copper">{u.concept.name}</span>
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-steel line-clamp-2">
                          {u.whyItMatters}
                        </p>
                      </div>
                    ))}
                  </PanelBody>
                </Panel>
              )}
            </div>
          )}
        </div>

        {/* ---------- 右栏：馆藏 + 阅读路径 + 记忆 ---------- */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              icon={Landmark}
              title="direct holdings · 直达馆藏"
              accent="copper"
              right={
                <span className="font-mono text-[10px] text-steel-dim">
                  {search.resources.length} items
                </span>
              }
            />
            <PanelBody className="space-y-2 pt-3">
              {search.resources.length === 0 && (
                <p className="text-xs text-steel-dim">demo seed 中暂无直接匹配。</p>
              )}
              {search.resources.map((r) => (
                <ResourceCard key={r.id} resource={r} compact />
              ))}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader icon={Route} title="reading path · 阅读路径" />
            <PanelBody className="pt-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {search.readingPath.map((name, i) => (
                  <span key={name} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-[10px] text-steel-dim">→</span>}
                    <span className="rounded-md border border-ink-border bg-ink-raise px-2 py-0.5 text-[11.5px] text-steel">
                      {name}
                    </span>
                  </span>
                ))}
              </div>
            </PanelBody>
          </Panel>

          {memory && (
            <Panel>
              <PanelHeader
                icon={BrainCircuit}
                title="memory core · 记忆核心"
                accent="cyan"
                right={
                  <Link href="/memory" className="font-mono text-[10px] text-pulse hover:underline">
                    full view →
                  </Link>
                }
              />
              <PanelBody className="space-y-2 pt-3">
                <MemoryRow k="数学容忍度" v={memory.memory.difficulty.mathTolerance.toFixed(2)} />
                <MemoryRow k="默认探索距离" v={String(memory.memory.serendipity.defaultSlider)} />
                <MemoryRow
                  k="偏好领域"
                  v={memory.memory.serendipity.likedDomains.join("、") || "—"}
                />
                <MemoryRow
                  k="回避领域"
                  v={memory.memory.serendipity.dislikedDomains.join("、") || "—"}
                />
              </PanelBody>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function MemoryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-ink-border/60 pb-1.5 text-xs last:border-0 last:pb-0">
      <span className="shrink-0 text-steel-dim">{k}</span>
      <span className="truncate font-mono text-[11px] text-ivory">{v}</span>
    </div>
  );
}
