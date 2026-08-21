"use client";
/**
 * 反馈条：一次点击 + 可选补充文本。
 * 提交后展示 memory patch 结果（记忆真实变化的即时证据）。
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ThumbsUp, Crosshair, BookCheck, Rocket, Sigma, X, BrainCircuit, Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FeedbackRating, FeedbackTargetType, MemoryPatch } from "@/lib/types";
import { cn } from "@/lib/utils";

const RATINGS: Array<{
  rating: FeedbackRating;
  label: string;
  icon: LucideIcon;
  tone?: "rose";
}> = [
  { rating: "useful", label: "有用", icon: ThumbsUp },
  { rating: "just_right", label: "刚刚好", icon: Crosshair },
  { rating: "too_close", label: "太熟了", icon: BookCheck },
  { rating: "too_far", label: "跳太远", icon: Rocket, tone: "rose" },
  { rating: "too_hard", label: "太难了", icon: Sigma },
  { rating: "not_relevant", label: "不相关", icon: X },
];

export function FeedbackBar({
  userId,
  interactionId,
  targetType,
  targetId,
  onDone,
}: {
  userId: string;
  interactionId: string;
  targetType: FeedbackTargetType;
  targetId: string;
  onDone?: () => void;
}) {
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState<FeedbackRating | null>(null);
  const [patches, setPatches] = useState<MemoryPatch[] | null>(null);

  async function submit(rating: FeedbackRating) {
    setSubmitting(rating);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          interactionId,
          targetType,
          targetId,
          rating,
          freeText: freeText.trim() || undefined,
        }),
      });
      const data = await res.json();
      setPatches(data.memoryPatches ?? []);
      onDone?.();
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="mt-3 border-t border-ink-border/70 pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-steel-dim">
          feedback
        </span>
        {RATINGS.map(({ rating, label, icon: Icon, tone }) => {
          const busy = submitting === rating;
          return (
            <button
              key={rating}
              disabled={submitting !== null}
              onClick={() => submit(rating)}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
                "disabled:pointer-events-none disabled:opacity-40",
                tone === "rose"
                  ? "border-rosewood/30 text-rosewood/80 hover:border-rosewood/60 hover:text-rosewood"
                  : "border-ink-border text-steel hover:border-pulse/40 hover:text-pulse",
                busy && "border-pulse/60 text-pulse opacity-100",
              )}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
              {label}
            </button>
          );
        })}
      </div>

      <input
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder="补充一句（可选）：例如 有意思但数学太难 / 中文优先"
        className="mt-2 h-8 w-full rounded-md border border-ink-border bg-ink px-2.5 text-xs text-ivory placeholder:text-steel-dim focus:border-pulse/50 focus:outline-none"
      />

      <AnimatePresence>
        {patches && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-md border border-pulse/25 bg-pulse-faint/25 p-2.5">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-pulse">
                <BrainCircuit className="h-3 w-3" />
                memory compiled
              </span>
              {patches.length === 0 ? (
                <p className="mt-1 text-xs text-steel">已记录，本次反馈无需修改偏好。</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {patches.map((p, i) => (
                    <li key={i} className="flex items-baseline gap-1.5 text-xs text-steel">
                      <code className="shrink-0 font-mono text-[10px] text-pulse/80">{p.key}</code>
                      <span className="min-w-0">{p.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
