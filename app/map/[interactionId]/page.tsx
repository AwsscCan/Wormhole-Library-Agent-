"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { SearchResponse } from "@/lib/types";

/**
 * Knowledge Map 页（骨架占位 — Day 3 用 React Flow 增强）
 * 目前：以文本网络方式展示 概念 → 阅读路径，保证页面可用而非空壳。
 */
export default function MapPage({
  params,
}: {
  params: Promise<{ interactionId: string }>;
}) {
  const { interactionId } = use(params);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/search?interactionId=${interactionId}`)
      .then((r) => {
        if (!r.ok) throw new Error("找不到这次检索，请回首页重新提问。");
        return r.json();
      })
      .then(setSearch)
      .catch((e) => setError(e.message));
  }, [interactionId]);

  if (error) {
    return (
      <div>
        <p className="error-text">{error}</p>
        <Link href="/">← 回首页</Link>
      </div>
    );
  }
  if (!search) return <p className="muted">加载中…</p>;

  return (
    <div>
      <h1>🗺️ 知识地图</h1>
      <p className="subtitle">「{search.query}」的概念网络（图形化视图 Day 3 接入 React Flow）</p>

      <div className="card">
        <h3>起点概念</h3>
        {search.concepts.map((c) => (
          <span key={c.id} className="chip selected">{c.name}</span>
        ))}
      </div>

      <div className="card">
        <h3>阅读路径</h3>
        <div className="wormhole-path">
          {search.readingPath.map((name, i) => (
            <span key={name} style={{ display: "contents" }}>
              {i > 0 && <span className="arrow">→</span>}
              <span className="node">{name}</span>
            </span>
          ))}
        </div>
      </div>

      <Link href={`/explore/${interactionId}`}>← 回到探索页</Link>
    </div>
  );
}
