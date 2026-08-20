"use client";
import { useState } from "react";
import type { FeedbackRating, FeedbackTargetType, MemoryPatch } from "@/lib/types";

const RATINGS: Array<{ rating: FeedbackRating; label: string }> = [
  { rating: "useful", label: "👍 有用" },
  { rating: "just_right", label: "🎯 刚刚好" },
  { rating: "too_close", label: "😐 太熟了" },
  { rating: "too_far", label: "🚀 跳太远" },
  { rating: "too_hard", label: "🧮 太难了" },
  { rating: "not_relevant", label: "🙅 不相关" },
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
  const [busy, setBusy] = useState(false);
  const [patches, setPatches] = useState<MemoryPatch[] | null>(null);

  async function submit(rating: FeedbackRating) {
    setBusy(true);
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
          freeText: freeText || undefined,
        }),
      });
      const data = await res.json();
      setPatches(data.memoryPatches ?? []);
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="feedback-bar">
        {RATINGS.map((r) => (
          <button key={r.rating} className="ghost" disabled={busy} onClick={() => submit(r.rating)}>
            {r.label}
          </button>
        ))}
        <input
          placeholder="补充一句（可选），例如：有意思但数学太难"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
        />
      </div>
      {patches && (
        <div className="notice">
          {patches.length === 0
            ? "已记录反馈。"
            : (
              <>
                🧠 记忆已更新：
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {patches.map((p, i) => (
                    <li key={i}>{p.reason}</li>
                  ))}
                </ul>
              </>
            )}
        </div>
      )}
    </div>
  );
}
