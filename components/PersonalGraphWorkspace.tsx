"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addEdge, applyEdgeChanges, applyNodeChanges, Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, useReactFlow,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps, type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Eye, EyeOff, Library, Link2, LockKeyhole, Pin, PinOff, Save, Search, Trash2 } from "lucide-react";
import type { MergedGraph, ResearchSession, SourceTransparentResource, SystemGraphNodeKind } from "@/lib/research/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type GraphData = { label: string; kind: SystemGraphNodeKind; note?: string; pinned: boolean; resourceId?: string };
type FlowNode = Node<GraphData, "personal">;

function PersonalNode({ data, selected }: NodeProps<FlowNode>) {
  return <div className={cn("max-w-[210px] rounded-md border bg-ink-panel px-3 py-2 shadow-hair", selected ? "border-pulse shadow-glow-cyan-sm" : "border-ink-edge", data.kind === "resource" && "border-copper/60", data.kind === "wormhole" && "border-rosewood/60")}>
    <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-ink !bg-pulse" />
    <div className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-steel-dim"><span>{data.kind.replace("_", " ")}</span>{data.pinned && <Pin className="h-2.5 w-2.5 text-copper" />}</div>
    <div className="truncate text-xs text-ivory">{data.label}</div>
    {data.note && <div className="mt-1 line-clamp-2 text-[9px] text-steel">{data.note}</div>}
    <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-ink !bg-pulse" />
  </div>;
}
const nodeTypes: NodeTypes = { personal: PersonalNode };

function FocusController({ nodeId }: { nodeId?: string }) {
  const { getNode, setCenter } = useReactFlow();
  useEffect(() => {
    if (!nodeId) return;
    const node = getNode(nodeId);
    if (node) void setCenter(node.position.x, node.position.y, { zoom: 1.25, duration: 450 });
  }, [getNode, nodeId, setCenter]);
  return null;
}

function toFlow(graph: MergedGraph) {
  const nodes: FlowNode[] = graph.nodes.map((node) => ({
    id: node.id, type: "personal", position: node.position, hidden: node.hidden, draggable: !node.pinned,
    data: { label: node.label, kind: node.kind, note: node.note, pinned: node.pinned, resourceId: node.resourceId },
  }));
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target,
    data: { system: "system" in edge }, label: "label" in edge ? edge.label : undefined,
    animated: "system" in edge ? edge.type === "wormhole" : false,
    style: { stroke: "system" in edge ? "#2A3A5C" : "#D9A050", strokeWidth: "system" in edge ? 1.2 : 2 },
  }));
  return { nodes, edges };
}

export function PersonalGraphWorkspace({ initialSession, initialGraph, publicGraphHash, focusedNodeId, focusUnavailable }: { initialSession: ResearchSession; initialGraph: MergedGraph; publicGraphHash: string; focusedNodeId?: string; focusUnavailable?: string }) {
  const router = useRouter();
  const initial = useMemo(() => {
    const flow = toFlow(initialGraph);
    return { ...flow, nodes: flow.nodes.map((node) => ({ ...node, selected: node.id === focusedNodeId })) };
  }, [focusedNodeId, initialGraph]);
  const [session, setSession] = useState(initialSession);
  const [nodes, setNodes] = useState<FlowNode[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(focusedNodeId ?? "topic");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [libraryResults, setLibraryResults] = useState<SourceTransparentResource[]>([]);
  const selected = nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => { setNodes((current) => applyNodeChanges(changes, current)); if (changes.some((change) => change.type === "position" || change.type === "remove")) setDirty(true); }, []);
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => { setEdges((current) => applyEdgeChanges(changes, current)); if (changes.some((change) => change.type === "remove")) setDirty(true); }, []);
  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, id: `personal:${crypto.randomUUID()}`, data: { system: false }, label: "personal note", style: { stroke: "#D9A050", strokeWidth: 2 } }, current));
    setDirty(true);
  }, []);

  function updateSelected(patch: Partial<GraphData> & { hidden?: boolean }) {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => node.id === selectedNodeId ? {
      ...node, hidden: patch.hidden ?? node.hidden, draggable: patch.pinned === undefined ? node.draggable : !patch.pinned,
      data: { ...node.data, ...patch },
    } : node));
    setDirty(true);
  }

  async function save() {
    setSaving(true); setMessage(null);
    const existing = session.personalGraph.nodeOverrides;
    const nodeOverrides = Object.fromEntries(nodes.map((node) => [node.id, {
      ...existing[node.id], position: node.position, pinned: node.data.pinned, hidden: Boolean(node.hidden),
      label: node.data.label, note: node.data.note ?? "", updatedAt: new Date().toISOString(),
    }]));
    const hiddenSystemEdgeIds = initial.edges.filter((edge) => edge.data?.system && !edges.some((item) => item.id === edge.id)).map((edge) => edge.id);
    const personalEdges = edges.filter((edge) => !edge.data?.system).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, type: "personal_note" as const, label: typeof edge.label === "string" ? edge.label : undefined }));
    try {
      const response = await fetch(`/api/research/sessions/${session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: session.personalGraph.version, nodeOverrides, hiddenSystemEdgeIds, personalEdges }) });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? "另一窗口保存了更新。请刷新后重新应用本次修改。" : data.error?.message ?? "保存失败");
      setSession(data); setDirty(false); setMessage(`已保存工作层 v${data.personalGraph.version}；公共图哈希未变。`);
      return true;
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "保存失败"); return false; } finally { setSaving(false); }
  }

  async function act(action: "search" | "library" | "add_evidence", resourceId?: string, topic = selected?.data.label ?? session.researchQuestion) {
    if (!selected) return;
    setActing(true); setMessage(null);
    try {
      if (dirty && !(await save())) return;
      const response = await fetch(`/api/research/sessions/${session.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, nodeId: selected.id, topic, resourceId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.code === "SOURCE_FAILURE" ? "来源暂时不可用；这不是‘无结果’，你的图已保留。" : data.error?.message ?? "操作失败");
      if (action === "search") router.push(data.href);
      else if (action === "library") { setLibraryResults(data.resources); setMessage(data.degraded ? "来源透明馆藏端口尚未接入；这不是‘无结果’，你的会话已保留。" : data.empty ? "这个主题暂时没有找到资源，可以换词重试。" : `找到 ${data.resources.length} 条主题馆藏。`); }
      else { setSession((current) => ({ ...current, evidenceIds: data.evidenceIds })); setMessage("已加入当前会话的证据篮子。"); router.refresh(); }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "操作失败"); } finally { setActing(false); }
  }

  function removeSelectedEdge() {
    if (!selectedEdge) return;
    setEdges((current) => current.filter((edge) => edge.id !== selectedEdge.id));
    setSelectedEdgeId(null); setDirty(true);
  }

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  return <div className="grid gap-3 xl:grid-cols-[1fr_330px]">
    <div className="relative rf-cockpit h-[calc(100vh-10rem)] min-h-[560px] overflow-hidden rounded-lg border border-ink-border bg-ink-panel/60">
      <div className="absolute left-3 top-3 z-10 rounded border border-ink-border bg-ink/90 px-2 py-1 font-mono text-[9px] text-steel-dim">PUBLIC SHA-256 {publicGraphHash.slice(0, 12)}… · PRIVATE v{session.personalGraph.version}</div>
      {focusUnavailable && <div role="alert" className="absolute left-3 top-10 z-10 rounded border border-copper/40 bg-ink/95 px-3 py-2 text-xs text-copper">目标资源 {focusUnavailable} 已失效或尚未投影；请回工作台重新生成。</div>}
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }} onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }} fitView minZoom={0.2} maxZoom={2} deleteKeyCode={null} nodesConnectable panOnDrag>
        <FocusController nodeId={focusedNodeId} />
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#1C2740" /><Controls />
      </ReactFlow>
    </div>
    <aside className="space-y-3">
      <div className="rounded-lg border border-ink-border bg-ink-panel p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-wider text-steel">workspace layer</span><span className={cn("text-[10px]", dirty ? "text-copper" : "text-pulse")}>{dirty ? "unsaved" : "saved"}</span></div>
        <Button variant="solid" className="mt-3 w-full" loading={saving} disabled={!dirty} onClick={save}><Save className="h-3.5 w-3.5" />保存个人工作层</Button>
        {message && <p role="status" className="mt-2 text-xs leading-relaxed text-steel">{message}</p>}
      </div>

      {selected && <div className="space-y-3 rounded-lg border border-ink-border bg-ink-panel p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase text-steel-dim">{selected.data.kind}</span><LockKeyhole className="h-3 w-3 text-pulse" /></div>
        <label className="block space-y-1 text-xs text-steel">个人标签<Input value={selected.data.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label>
        <label className="block space-y-1 text-xs text-steel">节点注释<textarea value={selected.data.note ?? ""} onChange={(event) => updateSelected({ note: event.target.value })} className="min-h-20 w-full rounded-md border border-ink-border bg-ink-raise p-2 text-xs text-ivory outline-none focus:border-pulse/60" /></label>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => updateSelected({ pinned: !selected.data.pinned })}>{selected.data.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}{selected.data.pinned ? "取消固定" : "固定位置"}</Button>
          <Button size="sm" onClick={() => updateSelected({ hidden: true })}><EyeOff className="h-3 w-3" />隐藏节点</Button>
          <Button size="sm" variant="outline" loading={acting} onClick={() => act("search")}><Search className="h-3 w-3" />搜索此主题</Button>
          <Button size="sm" variant="copper" loading={acting} onClick={() => act("library")}><Library className="h-3 w-3" />查看主题馆藏</Button>
          {selected.data.resourceId && <Button size="sm" className="col-span-2" loading={acting} onClick={() => act("add_evidence", selected.data.resourceId)}><Link2 className="h-3 w-3" />加入证据篮子</Button>}
          {selected.data.resourceId && <Button size="sm" className="col-span-2" onClick={() => router.push(`/research/${encodeURIComponent(session.id)}/workbench?resourceId=${encodeURIComponent(selected.data.resourceId!)}&view=evidence`)}><Link2 className="h-3 w-3" />返回工作台证据/草稿</Button>}
        </div>
        <p className="text-[10px] leading-relaxed text-steel-dim">从节点右侧连接点拖到另一节点可创建 personal_note 边。系统节点与系统边只会在你的工作层隐藏。</p>
      </div>}

      {selectedEdge && <div className="rounded-lg border border-ink-border bg-ink-panel p-3"><p className="text-xs text-steel">{selectedEdge.data?.system ? "系统边：删除只会写入你的隐藏列表。" : "个人 personal_note 边，可安全删除。"}</p><Button size="sm" variant="danger" className="mt-2 w-full" onClick={removeSelectedEdge}><Trash2 className="h-3 w-3" />{selectedEdge.data?.system ? "在个人层隐藏" : "删除个人边"}</Button></div>}

      {nodes.some((node) => node.hidden) && <div className="rounded-lg border border-ink-border bg-ink-panel p-3"><div className="mb-2 flex items-center gap-1 font-mono text-[9px] uppercase text-steel-dim"><Eye className="h-3 w-3" />hidden nodes</div>{nodes.filter((node) => node.hidden).map((node) => <button key={node.id} className="block w-full truncate py-1 text-left text-xs text-steel hover:text-pulse" onClick={() => { setSelectedNodeId(node.id); setNodes((items) => items.map((item) => item.id === node.id ? { ...item, hidden: false } : item)); setDirty(true); }}>恢复 · {node.data.label}</button>)}</div>}

      {libraryResults.length > 0 && <div className="space-y-2 rounded-lg border border-copper/30 bg-ink-panel p-3"><div className="font-mono text-[9px] uppercase text-copper">topic holdings</div>{libraryResults.map((resource) => <div key={resource.id} className="rounded border border-ink-border p-2"><div className="text-xs text-ivory">{resource.title}</div><div className="mt-1 flex items-center justify-between"><span className="text-[9px] text-steel-dim">{resource.provenance.sourceLabel} · {resource.availability}</span><Button size="sm" onClick={() => act("add_evidence", resource.id, resource.title)} disabled={session.evidenceIds.includes(resource.id)}>{session.evidenceIds.includes(resource.id) ? "已选择" : "选为证据"}</Button></div></div>)}</div>}
    </aside>
  </div>;
}
