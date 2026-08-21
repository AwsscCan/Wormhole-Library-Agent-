"use client";
/**
 * 知识地图页：当前探索的概念网络（React Flow）
 * 节点类型：当前主题（象牙）/ 路径概念（电青）/ 馆藏资源（铜金）
 */
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import type { SearchResponse } from "@/lib/types";
import { Panel, PanelBody } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type MapKind = "topic" | "bridge" | "resource";
type MapData = { label: string; kind: MapKind; sub?: string };
type MapFlowNode = Node<MapData, "atlas">;

function AtlasNode({ data }: NodeProps<MapFlowNode>) {
  return (
    <div
      className={cn(
        "max-w-[200px] rounded-md border px-2.5 py-1.5",
        data.kind === "topic" && "border-ivory/50 bg-ivory/10 shadow-hair",
        data.kind === "bridge" && "border-pulse/45 bg-pulse-faint/40",
        data.kind === "resource" && "border-copper/45 bg-copper-faint/30",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <span className="block font-mono text-[8.5px] uppercase tracking-[0.14em] text-steel-dim">
        {data.kind === "topic" ? "origin" : data.kind === "bridge" ? "concept" : "holding"}
      </span>
      <span
        className={cn(
          "block truncate text-[12px] leading-tight",
          data.kind === "topic" && "text-ivory",
          data.kind === "bridge" && "text-pulse",
          data.kind === "resource" && "text-copper",
        )}
      >
        {data.label}
      </span>
      {data.sub && (
        <span className="block truncate text-[9.5px] text-steel-dim">{data.sub}</span>
      )}
      <Handle type="source" position={Position.Right} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}

const nodeTypes: NodeTypes = { atlas: AtlasNode };

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
        if (!r.ok) throw new Error("找不到这次探索记录，请回导航台重新出发。");
        return r.json();
      })
      .then(setSearch)
      .catch((e) => setError(e.message));
  }, [interactionId]);

  const { nodes, edges } = useMemo(() => {
    if (!search) return { nodes: [] as MapFlowNode[], edges: [] as Edge[] };

    const ns: MapFlowNode[] = [];
    const es: Edge[] = [];

    // 阅读路径链（第一个是主题）
    search.readingPath.forEach((name, i) => {
      ns.push({
        id: `p_${i}`,
        type: "atlas",
        position: { x: i * 230, y: (i % 2) * 46 - 23 },
        data: { label: name, kind: i === 0 ? "topic" : "bridge" },
        draggable: true,
      });
      if (i > 0) {
        es.push({
          id: `pe_${i}`,
          source: `p_${i - 1}`,
          target: `p_${i}`,
          animated: true,
          style: { stroke: "#33D6E2", strokeWidth: 1.4, opacity: 0.8 },
        });
      }
    });

    // 馆藏资源挂到与其概念重叠的路径节点，否则挂主题
    search.resources.forEach((r, i) => {
      const anchorIdx = search.readingPath.findIndex((name) =>
        r.concepts.some((c) => c.name === name),
      );
      const anchor = `p_${Math.max(0, anchorIdx)}`;
      ns.push({
        id: `r_${r.id}`,
        type: "atlas",
        position: { x: Math.max(0, anchorIdx) * 230 + (i % 2) * 40 - 20, y: 170 + i * 78 },
        data: { label: r.title, kind: "resource", sub: r.location },
        draggable: true,
      });
      es.push({
        id: `re_${r.id}`,
        source: anchor,
        target: `r_${r.id}`,
        style: { stroke: "#D9A050", strokeWidth: 1.1, opacity: 0.55 },
      });
    });

    return { nodes: ns, edges: es };
  }, [search]);

  if (error) {
    return (
      <Panel className="mx-auto max-w-lg">
        <PanelBody className="space-y-3 text-center">
          <p className="text-sm text-rosewood">{error}</p>
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-pulse hover:underline">
            <ArrowLeft className="h-3 w-3" /> 回导航台
          </Link>
        </PanelBody>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/explore/${interactionId}`}
          className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-steel hover:text-pulse"
        >
          <ArrowLeft className="h-3 w-3" /> explore
        </Link>
        <h1 className="flex items-center gap-2 font-display text-lg text-ivory">
          <MapIcon className="h-5 w-5 text-pulse" />
          知识地图
        </h1>
        {search && (
          <span className="truncate text-xs text-steel-dim">「{search.query}」</span>
        )}
        <div className="ml-auto flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-wider text-steel-dim">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-ivory/50 bg-ivory/10" /> 主题
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-pulse/50 bg-pulse-faint/40" /> 概念
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-copper/50 bg-copper-faint/40" /> 馆藏
          </span>
        </div>
      </div>

      <div className="rf-cockpit h-[calc(100vh-11rem)] min-h-[420px] overflow-hidden rounded-lg border border-ink-border bg-ink-panel/60">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={1.8}
          zoomOnScroll={false}
          preventScrolling={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
        >
          <Background variant={BackgroundVariant.Dots} gap={30} size={1} color="#1C2740" />
        </ReactFlow>
      </div>
    </div>
  );
}
