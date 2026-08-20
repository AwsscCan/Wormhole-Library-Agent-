"use client";
import { useCallback, useEffect, useState } from "react";
import type { MemoryResponse } from "@/lib/types";

const DEMO_USER = "demo-user";

export default function MemoryPage() {
  const [data, setData] = useState<MemoryResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/memory?userId=${DEMO_USER}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function reset() {
    setBusy(true);
    try {
      const res = await fetch(`/api/memory?userId=${DEMO_USER}`, { method: "DELETE" });
      setData(await res.json());
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="muted">加载中…</p>;
  const m = data.memory;

  return (
    <div>
      <h1>🧠 我的记忆</h1>
      <p className="subtitle">
        Agent 不存聊天记录，只把你的反馈编译成结构化偏好。这里是全部内容，透明可控。
      </p>

      <div className="grid-2">
        <div className="card">
          <h3>阅读偏好</h3>
          <div className="memory-kv"><span className="k">语言</span><span>{m.reading.language}</span></div>
          <div className="memory-kv"><span className="k">资源类型顺序</span><span>{m.reading.resourceTypeOrder.join(" → ")}</span></div>
          <div className="memory-kv"><span className="k">概览优先</span><span>{m.reading.summaryFirst ? "是" : "否"}</span></div>
          <div className="memory-kv"><span className="k">最大结果数</span><span>{m.reading.maxResults}</span></div>
        </div>

        <div className="card">
          <h3>难度偏好</h3>
          <div className="memory-kv"><span className="k">偏好难度</span><span>{m.difficulty.preferredLevel}</span></div>
          <div className="memory-kv"><span className="k">数学容忍度</span><span>{m.difficulty.mathTolerance}</span></div>
          <div className="memory-kv"><span className="k">论文密度</span><span>{m.difficulty.paperDensity}</span></div>
        </div>

        <div className="card">
          <h3>意外度偏好</h3>
          <div className="memory-kv"><span className="k">默认滑块</span><span>{m.serendipity.defaultSlider}</span></div>
          <div className="memory-kv"><span className="k">喜欢的领域</span><span>{m.serendipity.likedDomains.join("、") || "—"}</span></div>
          <div className="memory-kv"><span className="k">不喜欢的领域</span><span>{m.serendipity.dislikedDomains.join("、") || "—"}</span></div>
        </div>

        <div className="card">
          <h3>社交偏好</h3>
          <div className="memory-kv"><span className="k">匹配模式</span><span>{m.social.matchingMode}</span></div>
          <div className="memory-kv"><span className="k">匿名优先</span><span>{m.social.anonymousFirst ? "是" : "否"}</span></div>
          <div className="memory-kv"><span className="k">Living Book 加入</span><span>{m.social.livingBookOptIn ? "已加入" : "未加入"}</span></div>
        </div>
      </div>

      <h2>最近记忆更新</h2>
      {data.recentUpdates.length === 0 && <p className="muted">还没有更新。去 Explore 页给推荐一点反馈试试。</p>}
      {data.recentUpdates.map((u, i) => (
        <div key={i} className="card">
          <div className="meta">{new Date(u.at).toLocaleString()}</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13.5 }}>
            {u.patches.map((p, j) => (
              <li key={j}>
                <code>{p.key}</code>：{p.reason}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div style={{ marginTop: 20 }}>
        <button className="ghost" onClick={reset} disabled={busy}>
          {busy ? "重置中…" : "🔄 重置 Demo 记忆"}
        </button>
      </div>
    </div>
  );
}
