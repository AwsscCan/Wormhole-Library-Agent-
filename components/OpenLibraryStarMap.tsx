"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, LibraryBig, Search } from "lucide-react";
import { Background, BackgroundVariant, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { OPEN_LIBRARY_ROOT_SUBJECTS, openLibrarySubjectId, type OpenLibrarySubjectResult } from "@/lib/catalog/openLibrarySubjects";
import { cn } from "@/lib/utils";

type LibraryStarData = { label: string; meta: string; kind: "root" | "subject" | "branch" | "work"; onOpen?: () => void };
type LibraryStarNode = Node<LibraryStarData, "library-star">;

function LibraryStar({ data }: NodeProps<LibraryStarNode>) {
  const content = <><span className={cn("h-1 w-1 shrink-0 rounded-full", data.kind === "work" ? "bg-copper" : "bg-pulse")} /><span className="max-w-[150px] truncate">{data.label}</span>{data.kind === "work" && <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100" />}</>;
  return <div className="relative">
    {data.kind !== "subject" && <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-transparent" />}
    {data.onOpen ? <button type="button" onClick={data.onOpen} className={cn("atlas-star-surface group flex h-[26px] items-center gap-1.5 border bg-ink/70 px-2 font-mono text-[8px] backdrop-blur-[2px]", data.kind === "work" ? "border-copper/25 text-copper" : data.kind === "subject" ? "border-pulse/55 text-pulse" : "border-ink-border/55 text-steel hover:border-pulse/40 hover:text-ivory")} title={`${data.label} · ${data.meta}`}>{content}</button> : <div className={cn("atlas-star-surface group flex h-[30px] items-center gap-1.5 border bg-ink/80 px-2 font-mono text-[8px]", data.kind === "subject" ? "border-pulse/65 text-pulse" : "border-ink-border/55 text-steel")}>{content}</div>}
    {data.kind !== "work" && <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-transparent" />}
  </div>;
}

const nodeTypes: NodeTypes = { "library-star": LibraryStar };

export function OpenLibraryStarMap({ onPick, className }: { onPick?: (label: string) => void; className?: string }) {
  const [trail, setTrail] = useState<Array<{ id: string; label: string }>>([]);
  const [result, setResult] = useState<OpenLibrarySubjectResult | null>(null);
  const [subjectQuery, setSubjectQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestSubject = useCallback(async (id: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v3/catalog/openlibrary/subjects?subject=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "分类读取失败");
      return data as OpenLibrarySubjectResult;
    } finally { setLoading(false); }
  }, []);

  const openSubject = useCallback(async (id: string, label: string) => {
    try {
      const data = await requestSubject(id);
      setResult(data);
      setTrail((items) => items.at(-1)?.id === id ? items : [...items, { id, label }].slice(-8));
      onPick?.(label);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "分类读取失败"); }
  }, [onPick, requestSubject]);

  function back() {
    if (trail.length <= 1) { setTrail([]); setResult(null); return; }
    const next = trail.slice(0, -1);
    setTrail(next);
    const target = next[next.length - 1];
    if (target) void requestSubject(target.id).then(setResult).catch((cause) => setError(cause instanceof Error ? cause.message : "分类读取失败"));
    else setResult(null);
  }

  function submitSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = subjectQuery.trim();
    if (!label || loading) return;
    const root = OPEN_LIBRARY_ROOT_SUBJECTS.find((subject) => subject.label === label || subject.id === label);
    void openSubject(root?.id ?? openLibrarySubjectId(label), label);
  }

  const graph = useMemo(() => {
    if (!result) {
      const nodes: LibraryStarNode[] = [{ id: "catalogue", type: "library-star", position: { x: 0, y: 0 }, data: { label: "Open Library", meta: "全部分类", kind: "subject" }, draggable: false }];
      const edges: Edge[] = [];
      OPEN_LIBRARY_ROOT_SUBJECTS.forEach((subject, index) => {
        const angle = index / OPEN_LIBRARY_ROOT_SUBJECTS.length * Math.PI * 2 - Math.PI / 2;
        const radius = 210 + index % 3 * 65;
        const id = `root:${subject.id}`;
        nodes.push({ id, type: "library-star", position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }, data: { label: subject.label, meta: "Open Library 分类 · 点击下钻", kind: "root", onOpen: () => void openSubject(subject.id, subject.label) }, draggable: false });
        edges.push({ id: `catalogue:${id}`, source: "catalogue", target: id, type: "default", style: { stroke: "var(--atlas-edge-system)", strokeWidth: 0.85, opacity: 0.5 } });
      });
      return { nodes, edges };
    }
    const nodes: LibraryStarNode[] = [{ id: "subject", type: "library-star", position: { x: 0, y: 0 }, data: { label: result.label, meta: `${result.workCount} 部作品`, kind: "subject", onOpen: () => undefined }, draggable: false }];
    const edges: Edge[] = [];
    result.branches.forEach((branch, index) => {
      const angle = index / Math.max(1, result.branches.length) * Math.PI * 2 - Math.PI / 2;
      const id = `branch:${branch.id}`;
      nodes.push({ id, type: "library-star", position: { x: Math.cos(angle) * 230, y: Math.sin(angle) * 180 }, data: { label: branch.label, meta: `${branch.count} 条当前命中`, kind: "branch", onOpen: () => void openSubject(branch.id, branch.label) }, draggable: false });
      edges.push({ id: `subject:${id}`, source: "subject", target: id, type: "default", style: { stroke: "var(--atlas-edge-system)", strokeWidth: 0.7, opacity: 0.4 } });
    });
    result.works.slice(0, 24).forEach((work, index) => {
      const angle = index / Math.max(1, Math.min(24, result.works.length)) * Math.PI * 2 - Math.PI / 2;
      const id = `work:${work.id}`;
      nodes.push({ id, type: "library-star", position: { x: Math.cos(angle) * (390 + index % 2 * 65), y: Math.sin(angle) * (300 + index % 3 * 45) }, data: { label: work.title, meta: `${work.authors.slice(0, 2).join("、") || "Open Library"}${work.year ? ` · ${work.year}` : ""}`, kind: "work", onOpen: () => window.open(work.url, "_blank", "noopener,noreferrer") }, draggable: false });
      const branch = result.branches.find((candidate) => work.subjects.some((subject) => openLibrarySubjectId(subject) === candidate.id));
      edges.push({ id: `edge:${id}`, source: branch ? `branch:${branch.id}` : "subject", target: id, type: "default", style: { stroke: "var(--atlas-edge-holding)", strokeWidth: 0.65, opacity: 0.32 } });
    });
    return { nodes, edges };
  }, [result, openSubject]);

  return <div className={cn("rf-cockpit relative h-full w-full", className)}>
    <div className="absolute left-3 top-11 z-10 flex items-center gap-2 border border-ink-border bg-ink/90 px-2 py-1 text-[10px] text-steel">
      {trail.length > 0 && <button type="button" onClick={back} aria-label="返回上一级分类" className="text-pulse"><ArrowLeft className="h-3.5 w-3.5" /></button>}
      <LibraryBig className="h-3.5 w-3.5 text-copper" />
      <span>{trail.length ? trail.map((item) => item.label).join(" / ") : "Open Library 全部分类"}</span>
      {loading && <span className="text-pulse">读取中…</span>}
    </div>
    <form onSubmit={submitSubject} className="absolute left-3 top-[4.5rem] z-10 flex h-8 items-center gap-1 border border-ink-border bg-ink/92 px-2">
      <Search className="h-3.5 w-3.5 shrink-0 text-copper" />
      <input value={subjectQuery} onChange={(event) => setSubjectQuery(event.target.value)} placeholder="查询 Open Library 分类" aria-label="查询 Open Library 分类" className="w-44 bg-transparent text-xs text-ivory outline-none placeholder:text-steel-dim" />
      <button type="submit" aria-label="打开分类" className="px-1.5 text-[10px] text-pulse hover:text-ivory">打开</button>
    </form>
    {error && <div role="alert" className="absolute left-3 top-20 z-10 border border-rosewood/40 bg-ink/95 px-3 py-2 text-xs text-rosewood">{error}</div>}
    <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.25} maxZoom={2} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag>
      <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--atlas-grid-dot)" />
    </ReactFlow>
  </div>;
}
