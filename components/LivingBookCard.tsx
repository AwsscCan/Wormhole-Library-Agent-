"use client";
import { useState } from "react";
import type { LivingBookCard as LivingBookCardData } from "@/lib/types";

const WILLING_LABEL: Record<string, string> = {
  async_answer: "文字答疑",
  coffee_chat: "15分钟聊天",
  project_review: "项目点评",
  reading_guide: "领读入门",
};

export function LivingBookCard({
  livingBook,
  userId,
}: {
  livingBook: LivingBookCardData;
  userId: string;
}) {
  const [requestState, setRequestState] = useState<"idle" | "sending" | "pending">("idle");

  async function requestContact() {
    setRequestState("sending");
    await fetch("/api/contact-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        personMatchId: livingBook.id,
        message: "想约一次 15 分钟的交流。",
      }),
    });
    setRequestState("pending");
  }

  return (
    <div className="card" style={{ borderColor: "var(--accent-2)" }}>
      <h3>
        📖 {livingBook.displayMode === "named" && livingBook.displayName
          ? livingBook.displayName
          : "匿名 Living Book"}
      </h3>
      <p className="why">{livingBook.headline}</p>
      <div style={{ margin: "6px 0" }}>
        {livingBook.expertiseConcepts.map((c) => (
          <span key={c.id} className="chip green">{c.name}</span>
        ))}
      </div>
      <div className="meta">
        可提供：{livingBook.willingTypes.map((t) => WILLING_LABEL[t] ?? t).join("、") || "—"}
        {livingBook.availabilityNote ? ` · 时间：${livingBook.availabilityNote}` : ""}
      </div>
      <div style={{ marginTop: 10 }}>
        {requestState === "pending" ? (
          <span className="muted">✓ 请求已发送，等待对方同意后才会互换联系方式</span>
        ) : (
          <button className="ghost" onClick={requestContact} disabled={requestState === "sending"}>
            匿名发起交流请求
          </button>
        )}
      </div>
    </div>
  );
}
