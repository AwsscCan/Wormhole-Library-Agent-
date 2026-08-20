"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO_USER = "demo-user";

const TASK_CHIPS = [
  { value: "course", label: "课程" },
  { value: "project", label: "项目" },
  { value: "research", label: "研究" },
  { value: "exam", label: "考试" },
  { value: "curiosity", label: "好奇" },
] as const;

const LEVEL_CHIPS = [
  { value: "beginner", label: "初学" },
  { value: "undergraduate", label: "本科" },
  { value: "graduate", label: "研究生" },
  { value: "research", label: "研究者" },
] as const;

const DEMO_QUERIES = [
  "I want to learn AI Agent for a project",
  "帮我找 Agent Memory 相关的资源",
  "RAG 和信息检索入门",
];

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [taskType, setTaskType] = useState<string>("project");
  const [level, setLevel] = useState<string>("beginner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(q?: string) {
    const finalQuery = (q ?? query).trim();
    if (!finalQuery || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: DEMO_USER, query: finalQuery, taskType, level }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      router.push(`/explore/${data.interactionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "搜索失败");
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>你今天想在图书馆探索什么？</h1>
      <p className="subtitle">
        我可以找到你要的资源——也知道什么时候该带你去一个你从没想过要搜的书架。
      </p>

      <div className="searchbox">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="例如：I want to learn AI Agent for a project"
          autoFocus
        />
        <button className="primary" onClick={() => submit()} disabled={busy || !query.trim()}>
          {busy ? "检索中…" : "问图书馆员"}
        </button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span className="muted" style={{ marginRight: 8 }}>目标：</span>
        {TASK_CHIPS.map((c) => (
          <span
            key={c.value}
            className={`chip clickable${taskType === c.value ? " selected" : ""}`}
            onClick={() => setTaskType(c.value)}
          >
            {c.label}
          </span>
        ))}
      </div>
      <div>
        <span className="muted" style={{ marginRight: 8 }}>水平：</span>
        {LEVEL_CHIPS.map((c) => (
          <span
            key={c.value}
            className={`chip clickable${level === c.value ? " selected" : ""}`}
            onClick={() => setLevel(c.value)}
          >
            {c.label}
          </span>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}

      <h2>试试这些</h2>
      {DEMO_QUERIES.map((q) => (
        <div key={q} className="card clickable" style={{ cursor: "pointer" }} onClick={() => submit(q)}>
          <span className="muted">💬</span> {q}
        </div>
      ))}
    </div>
  );
}
