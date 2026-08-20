"use client";
import { useEffect, useState } from "react";
import type { LivingBookCard as LivingBookCardData } from "@/lib/types";
import { LivingBookCard } from "@/components/LivingBookCard";
import livingBooksSeed from "@/data/seed-living-books.json";

const DEMO_USER = "demo-user";

/**
 * Living Library 页（骨架版 — 队友02 的 consent 流程接入后增强）
 * 目前：展示可发现的 living books + opt-in 开关（本地状态演示）。
 */
export default function LivingLibraryPage() {
  const [optIn, setOptIn] = useState(false);
  const [books, setBooks] = useState<LivingBookCardData[]>([]);

  useEffect(() => {
    // 骨架期直接读 seed 中 consent 允许的数据（与 fallback engine 同一 consent 规则）
    const visible = livingBooksSeed.livingBooks
      .filter((lb) => lb.consentState.startsWith("discoverable"))
      .map((lb) => ({
        id: lb.id,
        displayMode: lb.displayMode as LivingBookCardData["displayMode"],
        displayName:
          lb.consentState === "discoverable_named" && lb.displayName
            ? lb.displayName
            : undefined,
        headline: lb.headline,
        expertiseConcepts: lb.conceptIds.map((id) => ({ id, name: id.replace(/^c_/, "").replace(/_/g, " ") })),
        willingTypes: lb.willingTypes as LivingBookCardData["willingTypes"],
        expertiseLevel: lb.expertiseLevel as LivingBookCardData["expertiseLevel"],
        availabilityNote: lb.availabilityNote ?? undefined,
        contactState: "request_required" as const,
      }));
    setBooks(visible);
  }, []);

  return (
    <div>
      <h1>📖 Living Library</h1>
      <p className="subtitle">
        图书馆不只有书——愿意分享经验的人也是馆藏。所有人物都需要明确同意才能被发现，联系方式在双方同意前不会展示。
      </p>

      <div className="card">
        <h3>把我自己变成一本 Living Book</h3>
        <p className="why muted">开启后，其他同学可以按主题匿名找到你（演示功能）。</p>
        <button
          className={`ghost${optIn ? " active" : ""}`}
          onClick={() => setOptIn((v) => !v)}
        >
          {optIn ? "✓ 已开启可发现（匿名模式）" : "开启可发现"}
        </button>
      </div>

      <h2>可发现的 Living Books</h2>
      {books.map((lb) => (
        <LivingBookCard key={lb.id} livingBook={lb} userId={DEMO_USER} />
      ))}
    </div>
  );
}
