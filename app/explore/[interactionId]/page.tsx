"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  MemoryResponse,
  SearchResponse,
  WormholesResponse,
} from "@/lib/types";
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
  const [slider, setSlider] = useState(50);
  const [wormholes, setWormholes] = useState<WormholesResponse | null>(null);
  const [whBusy, setWhBusy] = useState(false);
  const [memorySnapshot, setMemorySnapshot] = useState<MemoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/search?interactionId=${interactionId}`)
      .then((r) => {
        if (!r.ok) throw new Error("找不到这次检索（服务可能重启过），请回首页重新提问。");
        return r.json();
      })
      .then(setSearch)
      .catch((e) => setError(e.message));
  }, [interactionId]);

  const refreshMemory = useCallback(() => {
    fetch(`/api/memory?userId=${DEMO_USER}`)
      .then((r) => r.json())
      .then(setMemorySnapshot)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshMemory();
  }, [refreshMemory]);

  async function generateWormholes() {
    if (!search) return;
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
      <div>
        <p className="error-text">{error}</p>
        <Link href="/">← 回首页</Link>
      </div>
    );
  }
  if (!search) return <p className="muted">加载中…</p>;

  return (
    <div>
      <h1>「{search.query}」</h1>
      <p className="subtitle">
        识别概念：
        {search.concepts.map((c) => (
          <span key={c.id} className="chip selected">{c.name}</span>
        ))}
        {search.memoryUsed.length > 0 && (
          <>　·　用到的记忆：{search.memoryUsed.join("；")}</>
        )}
      </p>

      <div className="grid-2">
        <section>
          <h2>📚 直接馆藏资源</h2>
          {search.resources.length === 0 && <p className="muted">没有匹配的馆藏（demo seed 较小）。</p>}
          {search.resources.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </section>

        <section>
          <h2>🧭 推荐阅读路径</h2>
          <div className="card">
            <div className="wormhole-path">
              {search.readingPath.map((name, i) => (
                <span key={name} style={{ display: "contents" }}>
                  {i > 0 && <span className="arrow">→</span>}
                  <span className="node">{name}</span>
                </span>
              ))}
            </div>
          </div>

          <h2>🌀 意外度滑块</h2>
          <div className="card">
            <SerendipitySlider value={slider} onChange={setSlider} />
            <button className="primary" style={{ width: "100%", marginTop: 10 }} onClick={generateWormholes} disabled={whBusy}>
              {whBusy ? "打开虫洞中…" : "打开知识虫洞"}
            </button>
          </div>

          {memorySnapshot && (
            <>
              <h2>🧠 当前记忆快照</h2>
              <div className="card">
                <div className="memory-kv"><span className="k">数学容忍度</span><span>{memorySnapshot.memory.difficulty.mathTolerance}</span></div>
                <div className="memory-kv"><span className="k">默认意外度</span><span>{memorySnapshot.memory.serendipity.defaultSlider}</span></div>
                <div className="memory-kv"><span className="k">喜欢的领域</span><span>{memorySnapshot.memory.serendipity.likedDomains.join("、") || "—"}</span></div>
                <div style={{ marginTop: 8 }}>
                  <Link href="/memory" className="muted">查看完整记忆 →</Link>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {wormholes && (
        <section>
          <h2>🌀 知识虫洞（意外度 {slider}）</h2>
          {wormholes.wormholes.length === 0 && (
            <p className="muted">这个意外度下没有可解释的虫洞，调整滑块再试试。</p>
          )}
          {wormholes.wormholes.map((w) => (
            <WormholeCard
              key={w.id}
              wormhole={w}
              interactionId={interactionId}
              userId={DEMO_USER}
              onFeedbackDone={refreshMemory}
            />
          ))}

          {wormholes.unknownUnknowns && wormholes.unknownUnknowns.length > 0 && (
            <>
              <h2>❓ 你可能不知道要搜的</h2>
              {wormholes.unknownUnknowns.map((u) => (
                <div key={u.concept.id} className="card" style={{ borderColor: "var(--warn)" }}>
                  <h3>你大概不会主动搜索：{u.concept.name}</h3>
                  <p className="why">{u.whyItMatters}</p>
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
