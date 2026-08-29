"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, LibraryBig } from "lucide-react";
import { Background, BackgroundVariant, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { OPEN_LIBRARY_ROOT_SUBJECTS, type OpenLibrarySubjectResult } from "@/lib/catalog/openLibrarySubjects";
import { cn } from "@/lib/utils";

type LibraryStarData = { label: string; meta: string; kind: "root" | "subject" | "branch" | "work"; onOpen: () => void };
type LibraryStarNode = Node<LibraryStarData, "library-star">;

function LibraryStar({ data }: NodeProps<LibraryStarNode>) {
  return <button type="button" onClick={data.onOpen} className={cn("atlas-star-surface group flex h-[22px] items-center gap-1.5 border bg-ink/70 px-1.5 font-mono text-[8px] backdrop-blur-[2px]", data.kind === "work" ? "border-copper/25 text-copper" : data.kind === "subject" ? "border-pulse/55 text-pulse" : "border-ink-border/55 text-steel hover:border-pulse/40 hover:text-ivory")} title={`${data.label} · ${data.meta}`}>
    <Handle type="target" position={Position.Top} className="!h-px !w-px !border-0 !bg-transparent" />
    <span className={cn("h-1 w-1 shrink-0 rounded-full", data.kind === "work" ? "bg-copper" : "bg-pulse")} />
    <span className="max-w-[150px] truncate">{data.label}</span>
    {data.kind === "work" && <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100" />}
    <Handle type="source" position={Position.Bottom} className="!h-px !w-px !border-0 !bg-transparent" />
  </button>;
}

const nodeTypes: NodeTypes = { "library-star": LibraryStar };

export function OpenLibraryStarMap({ onPick }: { onPick?: (label: string) => void }) {
  const [trail, setTrail] = useState<Array<{ id: string; label: string }>>([]);
  const [result, setResult] = useState<OpenLibrarySubjectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const openSubject = useCallback(async (id: string, label: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v3/catalog/openlibrary/subjects?subject=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "分类读取失败");
      setResult(data as OpenLibrarySubjectResult);
      setTrail((items) => [...items, { id, label }].slice(-4));
      onPick?.(label);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "分类读取失败"); }
    finally { setLoading(false); }
  }, [onPick]);

  function back() {
    if (trail.length <= 1) { setTrail([]); setResult(null); return; }
    const next = trail.slice(0, -1);
    setTrail(next.slice(0, -1));
    const target = next[next.length - 1];
    if (target) void openSubject(target.id, target.label);
  }

  const graph = useMemo(() => {
    if (!result) {
      const nodes: LibraryStarNode[] = OPEN_LIBRARY_ROOT_SUBJECTS.map((subject, index) => {
        const angle = index / OPEN_LIBRARY_ROOT_SUBJECTS.length * Math.PI * 2 - Math.PI / 2;
        const radius = 210 + index % 3 * 65;
        return { id: `root:${subject.id}`, type: "library-star", position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }, data: { label: subject.label, meta: "Open Library 分类", kind: "root", onOpen: () => void openSubject(subject.id, subject.label) }, draggable: false };
      });
      return { nodes, edges: [] as Edge[] };
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
      const branch = result.branches[index % Math.max(1, result.branches.length)];
      edges.push({ id: `edge:${id}`, source: branch ? `branch:${branch.id}` : "subject", target: id, type: "default", style: { stroke: "var(--atlas-edge-holding)", strokeWidth: 0.65, opacity: 0.32 } });
    });
    return { nodes, edges };
  }, [result, openSubject]);

  return <div className="rf-cockpit relative h-full w-full">
    <div className="absolute left-3 top-11 z-10 flex items-center gap-2 border border-ink-border bg-ink/90 px-2 py-1 text-[10px] text-steel">
      {trail.length > 0 && <button type="button" onClick={back} aria-label="返回上一级分类" className="text-pulse"><ArrowLeft className="h-3.5 w-3.5" /></button>}
      <LibraryBig className="h-3.5 w-3.5 text-copper" />
      <span>{trail.length ? trail.map((item) => item.label).join(" / ") : "Open Library 全部分类"}</span>
      {loading && <span className="text-pulse">读取中…</span>}
    </div>
    {error && <div role="alert" className="absolute left-3 top-20 z-10 border border-rosewood/40 bg-ink/95 px-3 py-2 text-xs text-rosewood">{error}</div>}
    <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.25} maxZoom={2} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag>
      <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--atlas-grid-dot)" />
    </ReactFlow>
  </div>;
}
