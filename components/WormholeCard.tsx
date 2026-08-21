"use client";
/**
 * 虫洞卡（视觉核心）：
 * 发光路径阶段动画（ORIGIN → BRIDGE → DEST）+ Novelty/Bridge/Quality 评分条
 * + 落点馆藏（铜）/ Living Book（铜虚线）+ 反馈条。
 */
import { motion } from "framer-motion";
import { Sparkles, ChevronRight } from "lucide-react";
import type { WormholeCard as WormholeCardData } from "@/lib/types";
import { ResourceCard } from "./ResourceCard";
import { LivingBookCard } from "./LivingBookCard";
import { FeedbackBar } from "./FeedbackBar";
import { cn } from "@/lib/utils";

function ScoreMeter({
  label,
  value,
  tone,
  delay,
}: {
  label: string;
  value: number;
  tone: "cyan" | "copper";
  delay: number;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.16em] text-steel-dim">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums",
            tone === "cyan" ? "text-pulse" : "text-copper",
          )}
        >
          {value.toFixed(2)}
        </span>
      </div>
      <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-ink-border/60">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(value * 100)}%` }}
          transition={{ delay, duration: 0.7, ease: "easeOut" }}
          className={cn(
            "h-full rounded-full",
            tone === "cyan" ? "bg-pulse shadow-glow-cyan-sm" : "bg-copper",
          )}
        />
      </div>
    </div>
  );
}

export function WormholeCard({
  wormhole,
  interactionId,
  userId,
  onFeedbackDone,
  index = 0,
}: {
  wormhole: WormholeCardData;
  interactionId: string;
  userId: string;
  onFeedbackDone?: () => void;
  index?: number;
}) {
  const baseDelay = index * 0.12;
  const last = wormhole.path.length - 1;

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: baseDelay, duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-lg border border-pulse/25 bg-ink-panel/95 shadow-hair transition-colors hover:border-pulse/45"
    >
      {/* 顶部电青情报条 */}
      <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-pulse/70 via-pulse/25 to-transparent" />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-pulse" />
            <h3 className="truncate font-display text-[16px] text-ivory">
              虫洞 → {wormhole.destination}
            </h3>
          </div>
          <div className="shrink-0 text-right">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-steel-dim">
              final
            </span>
            <div className="font-mono text-xl leading-none text-pulse">
              {wormhole.scores.final.toFixed(2)}
            </div>
          </div>
        </div>

        {/* 路径阶段动画 */}
        <div className="mt-3 flex flex-wrap items-center gap-y-2">
          {wormhole.path.map((name, i) => (
            <span key={`${name}-${i}`} className="flex min-w-0 items-center">
              <motion.span
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: baseDelay + 0.15 + i * 0.14, duration: 0.3 }}
                className={cn(
                  "max-w-[180px] rounded-md border px-2 py-1",
                  i === 0 && "border-ivory/35 bg-ivory/5",
                  i > 0 && i < last && "border-pulse/30 bg-pulse-faint/25",
                  i === last && "border-pulse/70 bg-pulse-faint/50 shadow-glow-cyan-sm",
                )}
              >
                <span className="block font-mono text-[8.5px] uppercase tracking-[0.14em] text-steel-dim">
                  {i === 0 ? "origin" : i === last ? "destination" : `bridge ${i}`}
                </span>
                <span
                  className={cn(
                    "block truncate text-[12.5px] leading-tight",
                    i === last ? "text-pulse" : i === 0 ? "text-ivory" : "text-steel",
                  )}
                >
                  {name}
                </span>
              </motion.span>
              {i < last && (
                <motion.span
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: baseDelay + 0.24 + i * 0.14, duration: 0.25 }}
                  className="mx-0.5 origin-left"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-pulse/60" />
                </motion.span>
              )}
            </span>
          ))}
        </div>

        <p className="mt-2.5 text-xs leading-relaxed text-steel line-clamp-3">
          {wormhole.explanation}
        </p>

        {/* 评分仪表 */}
        <div className="mt-3 flex gap-4">
          <ScoreMeter label="novelty" value={wormhole.scores.novelty} tone="cyan" delay={baseDelay + 0.3} />
          <ScoreMeter label="bridge" value={wormhole.scores.bridge} tone="cyan" delay={baseDelay + 0.4} />
          <ScoreMeter label="quality" value={wormhole.scores.quality} tone="copper" delay={baseDelay + 0.5} />
        </div>

        {/* 落点 */}
        {(wormhole.resources.length > 0 || wormhole.livingBooks.length > 0) && (
          <div className="mt-3.5 space-y-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-copper">
              landing · 落点馆藏
            </span>
            {wormhole.resources.map((r) => (
              <ResourceCard key={r.id} resource={r} compact />
            ))}
            {wormhole.livingBooks.map((lb) => (
              <LivingBookCard key={lb.id} livingBook={lb} userId={userId} />
            ))}
          </div>
        )}

        <FeedbackBar
          userId={userId}
          interactionId={interactionId}
          targetType="wormhole"
          targetId={wormhole.id}
          onDone={onFeedbackDone}
        />
      </div>
    </motion.article>
  );
}
