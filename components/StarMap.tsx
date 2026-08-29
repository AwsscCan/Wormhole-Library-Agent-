"use client";
/**
 * 知识星图（首页视觉中心）— React Flow
 * 节点按 domain 放射状分布；输入命中时节点点亮、邻接边流光。
 */
import { useEffect, useMemo, useState } from "react";
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
import { motion } from "framer-motion";
import { buildStarModel, type StarState } from "@/lib/starmap";
import { cn } from "@/lib/utils";

type StarData = {
  label: string;
  domain: string;
  state: StarState;
  index: number;
  onPick?: (label: string) => void;
};
type StarFlowNode = Node<StarData, "star">;

function StarNodeView({ data }: NodeProps<StarFlowNode>) {
  const { state } = data;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.2 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: data.index * 0.028, duration: 0.38, ease: "easeOut" }}
      onClick={() => data.onPick?.(data.label)}
      className={cn(
        "atlas-star-surface group flex h-[22px] cursor-pointer items-center gap-1.5 border px-1.5 transition-colors",
        state === "hit" &&
          "border-pulse/70 bg-pulse-faint/60 shadow-glow-cyan-sm",
        state === "linked" && "border-pulse/30 bg-ink-raise",
        state === "idle" && "border-ink-border/70 bg-ink-panel/80 hover:border-ink-edge",
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
          state === "hit" && "bg-pulse shadow-glow-cyan-sm",
          state === "linked" && "bg-pulse-dim",
          state === "idle" && "bg-steel-dim group-hover:bg-steel",
        )}
      />
      <span
        className={cn(
          "max-w-[130px] truncate font-mono text-[8px] transition-colors",
          state === "hit" && "text-ivory",
          state === "linked" && "text-steel",
          state === "idle" && "text-steel-dim group-hover:text-steel",
        )}
      >
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </motion.button>
  );
}

const nodeTypes: NodeTypes = { star: StarNodeView };

export function StarMap({
  query,
  onPick,
  className,
}: {
  query: string;
  onPick?: (label: string) => void;
  className?: string;
}) {
  // React Flow 的节点 transform 在 SSR/客户端精度不同会触发 hydration mismatch，
  // 星图只在客户端渲染（挂载前渲染同尺寸占位，避免布局跳动）。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { nodes, edges } = useMemo(() => {
    const model = buildStarModel(query);
    const flowNodes: StarFlowNode[] = model.nodes.map((n) => ({
      id: n.id,
      type: "star",
      position: { x: n.x, y: n.y },
      data: {
        label: n.label,
        domain: n.domain,
        state: n.state,
        index: n.index,
        onPick,
      },
      draggable: false,
      selectable: false,
      connectable: false,
    }));
    const flowEdges: Edge[] = model.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.lit,
      style: e.lit
        ? { stroke: "var(--atlas-edge-personal)", strokeWidth: 1.2, opacity: 0.78 }
        : { stroke: "var(--atlas-edge-system)", strokeWidth: 0.75, opacity: 0.38 },
    }));
    return { nodes: flowNodes, edges: flowEdges };
  }, [query, onPick]);

  return (
    <div className={cn("rf-cockpit h-full w-full", className)}>
      {!mounted ? (
        <div className="flex h-full w-full items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-steel-dim">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-pulse" />
          calibrating atlas…
        </div>
      ) : (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.8}
        zoomOnScroll={false}
        preventScrolling={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--atlas-grid-dot)" />
      </ReactFlow>
      )}
    </div>
  );
}
