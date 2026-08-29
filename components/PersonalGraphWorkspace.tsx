"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addEdge, applyEdgeChanges, applyNodeChanges, Background, BackgroundVariant, ConnectionLineType, Controls, Handle, Position, ReactFlow, useReactFlow,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps, type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BrainCircuit, Eye, EyeOff, Library, Link2, LockKeyhole, Map as MapIcon, Orbit, Pin, PinOff, Save, Search, Trash2 } from "lucide-react";
import type { HybridMemoryInsights } from "@/lib/research/memory";
import type { MergedGraph, ResearchSession, SourceTransparentResource, SystemGraphNodeKind } from "@/lib/research/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AtlasKind = SystemGraphNodeKind | "memory";
type GraphData = { label: string; kind: AtlasKind; note?: string; pinned: boolean; resourceId?: string; sourceUrl?: string; recommendationProjection?: true; searchFrequency?: number; brightness?: number; highlighted?: boolean; memoryWeight?: number; memoryReasons?: string[] };
type FlowNode = Node<GraphData, "atlas">;

const kindName: Record<AtlasKind, string> = { topic: "主题", search: "检索", concept: "概念", resource: "资源", wormhole: "虫洞", living_book: "活馆藏", memory: "记忆" };

function PersonalNode({ data, selected }: NodeProps<FlowNode>) {
  const brightness = Math.max(data.brightness ?? 0.45, data.memoryWeight ?? 0);
  const repeated = (data.searchFrequency ?? 0) > 1;
  const visualWidth = Math.min(188, Math.max(72, 32 + [...data.label].reduce((width, character) => width + (/[^\x00-\xff]/.test(character) ? 9 : 5.5), 0)));
  return <div className="group atlas-node h-[22px]" style={{ width: visualWidth, opacity: data.highlighted === false ? 0.16 : 0.5 + brightness * 0.5 }}>
    <Handle type="target" position={Position.Left} className="atlas-handle !h-1.5 !w-1.5 !border-0 !bg-pulse opacity-0 transition-opacity group-hover:opacity-70" />
    <div className={cn("atlas-node-core flex h-[22px] w-full items-center gap-1.5 rounded-[3px] border border-ink-border/45 bg-ink/65 px-1.5 font-mono text-[8px] text-steel backdrop-blur-[2px] transition-colors", data.kind === "topic" && "border-pulse/25 text-pulse", data.kind === "resource" && "border-copper/20 text-copper", data.kind === "memory" && "border-copper/30 text-copper", selected && "border-pulse/55 bg-pulse-faint/20 text-ivory ring-1 ring-pulse/15")} style={{ boxShadow: repeated || data.memoryWeight ? `0 0 ${4 + brightness * 11}px color-mix(in srgb, var(--theme-accent) ${Math.round(12 + brightness * 24)}%, transparent)` : undefined }} title={`${kindName[data.kind]} · ${data.label}`}>
      <span className={cn("h-1 w-1 shrink-0 rounded-full bg-ink-edge", data.kind === "topic" || data.kind === "concept" || data.kind === "search" ? "bg-pulse" : "", data.kind === "resource" || data.kind === "memory" ? "bg-copper" : "", data.kind === "wormhole" ? "bg-rosewood" : "")} style={{ boxShadow: `0 0 ${3 + brightness * 5}px currentColor` }} />
      <span className="min-w-0 flex-1 truncate leading-none">{data.label}</span>
      {repeated && <span className="shrink-0 text-[7px] text-pulse">x{data.searchFrequency}</span>}
      {data.pinned && <Pin className="hidden h-2 w-2 shrink-0 text-copper group-hover:block" />}
    </div>
    <Handle type="source" position={Position.Right} className="atlas-handle !h-1.5 !w-1.5 !border-0 !bg-pulse opacity-0 transition-opacity group-hover:opacity-70" />
  </div>;
}
const nodeTypes: NodeTypes = { atlas: PersonalNode };

function FocusController({ nodeId }: { nodeId?: string }) {
  const { getNode, setCenter } = useReactFlow();
  useEffect(() => {
    if (!nodeId) return;
    const node = getNode(nodeId);
    if (node) void setCenter(node.position.x, node.position.y, { zoom: 1.25, duration: 450 });
  }, [getNode, nodeId, setCenter]);
  return null;
}

function CatalogueViewportController({ active, nodeCount }: { active: boolean; nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!active || nodeCount < 2) return;
    const timer = window.setTimeout(() => void fitView({ padding: 0.06, duration: 420, minZoom: 0.62, maxZoom: 1.25 }), 80);
    return () => window.clearTimeout(timer);
  }, [active, fitView, nodeCount]);
  return null;
}

function terms(value: string) { return new Set(value.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1)); }
function intersects(left: Set<string>, right: Set<string>) { return [...left].some((term) => right.has(term)); }

const catalogueBranches = [
  { id: "computing", label: "计算与信息", position: { x: 75, y: -250 }, children: ["人工智能", "数据科学", "软件工程", "信息安全", "人机交互"] },
  { id: "society", label: "社会科学", position: { x: 310, y: -115 }, children: ["教育学", "经济学", "社会学", "法学", "管理学"] },
  { id: "humanities", label: "人文学科", position: { x: 95, y: 135 }, children: ["哲学", "历史学", "文学", "语言学", "艺术学"] },
  { id: "knowledge", label: "知识与文献", position: { x: -45, y: 255 }, children: ["图书情报", "知识管理", "文献计量", "数字人文", "综合研究"] },
  { id: "engineering", label: "工程技术", position: { x: -290, y: 120 }, children: ["机械工程", "电子工程", "材料科学", "能源科学", "建筑学"] },
  { id: "life", label: "生命与健康", position: { x: 310, y: 125 }, children: ["生物学", "医学", "神经科学", "心理学", "公共卫生"] },
  { id: "science", label: "自然科学", position: { x: -295, y: -120 }, children: ["数学", "物理学", "化学", "地球科学", "天文学"] },
] as const;

const clusterOffsets = [
  { x: -72, y: -62 },
  { x: 48, y: -70 },
  { x: -105, y: 8 },
  { x: 72, y: 12 },
  { x: -18, y: 70 },
] as const;

const categoryKeywords: Array<[string, RegExp]> = [
  ["人工智能", /artificial intelligence|machine learning|deep learning|neural|transformer|生成式|人工智能|机器学习/i],
  ["数据科学", /data science|data analysis|statistics|数据|统计/i],
  ["软件工程", /software|programming|algorithm|软件|编程|算法/i],
  ["信息安全", /security|privacy|cyber|安全|隐私/i],
  ["人机交互", /human.computer|interaction|interface|交互|界面/i],
  ["教育学", /education|learning|teaching|student|教育|学习|教学/i],
  ["经济学", /econom|finance|market|经济|金融|市场/i],
  ["社会学", /social|society|community|社会|社群/i],
  ["法学", /law|legal|crime|regulation|法律|犯罪|监管/i],
  ["管理学", /business|management|organization|商业|管理|组织/i],
  ["哲学", /philosophy|ethic|epistem|哲学|伦理|认识论/i],
  ["历史学", /history|historical|历史/i],
  ["文学", /literature|literary|writing|文学|写作/i],
  ["语言学", /language|linguistic|语义|语言/i],
  ["艺术学", /art|design|aesthetic|艺术|设计|美学/i],
  ["图书情报", /library|information retrieval|catalog|图书|检索|馆藏/i],
  ["知识管理", /knowledge|memory|rag|知识|记忆/i],
  ["文献计量", /bibliometric|citation|review|文献|引用|综述/i],
  ["机械工程", /mechanical|robot|manufactur|机械|机器人|制造/i],
  ["电子工程", /electr|circuit|signal|电子|电气|信号/i],
  ["材料科学", /material|材料/i],
  ["能源科学", /energy|climate|能源|气候/i],
  ["建筑学", /architecture|urban|建筑|城市/i],
  ["生物学", /biology|biological|genetic|生物|基因/i],
  ["医学", /medical|medicine|clinical|health|医学|临床|健康/i],
  ["神经科学", /neuroscience|neural science|神经/i],
  ["心理学", /psychology|cognitive|behavior|心理|认知|行为/i],
  ["公共卫生", /public health|epidem|公共卫生|流行病/i],
  ["数学", /mathemat|probability|optimization|数学|概率|优化/i],
  ["物理学", /physics|quantum|thermodynamic|物理|量子|热力学/i],
  ["化学", /chemistry|chemical|化学/i],
  ["地球科学", /earth|geology|geographic|地球|地质|地理/i],
  ["天文学", /astronomy|space|cosmology|天文|宇宙/i],
];

function catalogueCategoryId(label: string) { return `catalogue-category:${encodeURIComponent(label)}`; }
function inferCategories(value: string) {
  const matches = categoryKeywords.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
  return matches.length ? [...new Set(matches)].slice(0, 3) : ["综合研究"];
}

function memorySignal(node: FlowNode, memory: HybridMemoryInsights | null) {
  if (!memory) return { weight: 0, reasons: [] as string[] };
  const nodeTerms = terms(`${node.id} ${node.data.label}`);
  const preferences = memory.preferences.filter((preference) => intersects(nodeTerms, terms(preference.conceptId)));
  const events = memory.events.filter((event) => intersects(nodeTerms, terms(`${event.conceptId ?? ""} ${event.query ?? ""} ${event.resourceId ?? ""}`)));
  const matches = memory.retrieval.matches.filter((match) => intersects(nodeTerms, terms(`${match.conceptId ?? ""} ${match.text}`)));
  const reasons = [...preferences.map((preference) => `长期偏好 ${preference.conceptId} · ${Math.round(preference.confidence * 100)}%`), ...(events.length ? [`${events.length} 次相关行为`] : []), ...matches.slice(0, 2).map((match) => `RAG ${match.matchedVia} 命中 · ${match.score.toFixed(2)}`)];
  const weight = Math.min(1, preferences.reduce((sum, preference) => sum + preference.confidence * 0.55, 0) + Math.min(0.3, events.length * 0.06) + matches.reduce((sum, match) => sum + match.score * 0.35, 0));
  return { weight, reasons };
}

function applyMemoryLayer(baseNodes: FlowNode[], baseEdges: Edge[], memory: HybridMemoryInsights | null, visible: boolean) {
  const nodes = baseNodes.map((node) => { const signal = memorySignal(node, memory); return { ...node, data: { ...node.data, memoryWeight: signal.weight || undefined, memoryReasons: signal.reasons } }; });
  const weightById = new Map(nodes.map((node) => [node.id, node.data.memoryWeight ?? 0]));
  const edges = baseEdges.map((edge) => { const weight = (weightById.get(edge.source) ?? 0) + (weightById.get(edge.target) ?? 0); return { ...edge, style: { ...edge.style, strokeWidth: 1.1 + Math.min(2.6, weight * 1.8) } }; });
  if (!visible || !memory) return { nodes, edges };
  memory.retrieval.matches.slice(0, 6).forEach((match, index) => {
    const matchTerms = terms(`${match.conceptId ?? ""} ${match.text}`);
    const target = nodes.find((node) => node.data.kind === "concept" && intersects(terms(`${node.id} ${node.data.label}`), matchTerms)) ?? nodes[0];
    if (!target) return;
    const angle = index * 1.72 + 0.4;
    const id = `memory:${match.id}`;
    nodes.push({ id, type: "atlas", position: { x: target.position.x + Math.cos(angle) * 170, y: target.position.y + Math.sin(angle) * 135 }, draggable: false, data: { label: match.text.slice(0, 54), kind: "memory", pinned: true, note: `${match.kind} · ${match.sourceId}`, memoryWeight: Math.max(0.35, match.score), memoryReasons: [`${match.matchedVia} 召回`, `来源 ${match.sourceId}`] } });
    edges.push({ id: `memory-edge:${match.id}:${target.id}`, source: id, target: target.id, type: "default", data: { system: true, memoryLayer: true, relation: "记忆召回" }, style: { stroke: "var(--atlas-edge-memory)", strokeWidth: 0.8 + match.score * 1.2, strokeOpacity: 0.55, strokeDasharray: "3 5" } });
  });
  return { nodes, edges };
}

function toFlow(graph: MergedGraph, distanceScale: number, memory: HybridMemoryInsights | null, showMemory: boolean) {
  const nodes: FlowNode[] = graph.nodes.map((node) => ({
    id: node.id, type: "atlas", position: node.id === "topic" || node.pinned ? node.position : { x: Math.round(node.position.x * distanceScale), y: Math.round(node.position.y * distanceScale) }, hidden: node.hidden, draggable: !node.pinned,
    data: { label: node.label, kind: node.kind, note: node.note, pinned: node.pinned, resourceId: node.resourceId, recommendationProjection: node.recommendationProjection, searchFrequency: node.activity?.searchFrequency, brightness: node.activity?.brightness },
  }));
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, type: "default",
    data: { system: "system" in edge, recommendationProjection: "recommendationProjection" in edge && edge.recommendationProjection, relation: "label" in edge ? edge.label : edge.type },
    animated: "system" in edge ? edge.type === "wormhole" : false,
    style: { stroke: "system" in edge ? "var(--atlas-edge-system)" : "var(--atlas-edge-personal)", strokeWidth: "system" in edge ? 0.85 : 1.35, strokeOpacity: "system" in edge ? 0.38 : 0.6,
      strokeDasharray: "recommendationProjection" in edge && edge.recommendationProjection ? "5 4" : undefined },
  }));
  return applyMemoryLayer(nodes, edges, memory, showMemory);
}

function toCatalogueFlow(session: ResearchSession, graph: MergedGraph, query: string, memory: HybridMemoryInsights | null, showMemory: boolean) {
  const nodes: FlowNode[] = [{ id: "catalogue-topic", type: "atlas", position: { x: 0, y: 0 }, data: { label: "馆藏知识总图", kind: "topic", pinned: true } }];
  const edges: Edge[] = [];
  const categories = new Map<string, { label: string; position: { x: number; y: number } }>();
  const resources = new Map<string, { title: string; url?: string; source?: string; concepts: string[] }>();
  const categoryPositions = new Map<string, { x: number; y: number }>();

  catalogueBranches.forEach((branch, branchIndex) => {
    const branchId = catalogueCategoryId(branch.label);
    categories.set(branchId, { label: branch.label, position: branch.position });
    categoryPositions.set(branch.label, branch.position);
    branch.children.forEach((label, childIndex) => {
      const offset = clusterOffsets[(childIndex + branchIndex * 2) % clusterOffsets.length];
      const position = { x: branch.position.x + offset.x, y: branch.position.y + offset.y };
      categories.set(catalogueCategoryId(label), { label, position });
      categoryPositions.set(label, position);
      edges.push({ id: `catalogue:branch:${branchId}:${catalogueCategoryId(label)}`, source: branchId, target: catalogueCategoryId(label), type: "default", data: { system: true, relation: "学科分支" }, style: { stroke: "var(--atlas-edge-system)", strokeWidth: 0.55, strokeOpacity: 0.23 } });
    });
    edges.push({ id: `catalogue:topic:${branchId}`, source: "catalogue-topic", target: branchId, type: "default", data: { system: true, relation: "学科门类" }, style: { stroke: "var(--atlas-edge-system)", strokeWidth: 0.7, strokeOpacity: 0.3 } });
  });

  session.searches.forEach((search) => search.resources.forEach((resource) => {
    const concepts = inferCategories(`${resource.title} ${resource.concepts.map((concept) => concept.name).join(" ")}`);
    resources.set(resource.id, { title: resource.title, url: resource.sourceUrl, source: resource.sourceLabel, concepts });
  }));
  graph.nodes.filter((node) => node.kind === "resource" && node.resourceId).forEach((node) => {
    if (!resources.has(node.resourceId!)) resources.set(node.resourceId!, { title: node.label, concepts: inferCategories(node.label), source: node.recommendationProjection ? "推荐投影" : "馆藏" });
  });

  const needle = query.trim().toLocaleLowerCase();
  const activeCategories = new Set([...resources.values()].flatMap((resource) => resource.concepts));
  catalogueBranches.forEach((branch) => { if (branch.children.some((child) => activeCategories.has(child))) activeCategories.add(branch.label); });
  [...categories.entries()].forEach(([categoryId, category]) => {
    const hit = !needle || category.label.toLocaleLowerCase().includes(needle) || [...resources.values()].some((resource) => resource.concepts.includes(category.label) && resource.title.toLocaleLowerCase().includes(needle));
    nodes.push({ id: categoryId, type: "atlas", position: category.position, draggable: false, data: { label: category.label, kind: "concept", pinned: true, note: activeCategories.has(category.label) ? "当前知识已点亮" : "馆藏学科类别", highlighted: needle ? hit : activeCategories.has(category.label), brightness: needle ? (hit ? 0.95 : 0.15) : activeCategories.has(category.label) ? 0.9 : 0.2 } });
  });
  [...resources.entries()].forEach(([id, resource], index) => {
    const center = categoryPositions.get(resource.concepts[0]) ?? { x: 0, y: 0 };
    const angle = (index % 7) * 0.91 + Math.floor(index / 7) * 0.37;
    const hit = !needle || resource.title.toLocaleLowerCase().includes(needle) || resource.concepts.some((concept) => concept.toLocaleLowerCase().includes(needle));
    const nodeId = `catalogue-resource:${encodeURIComponent(id)}`;
    nodes.push({ id: nodeId, type: "atlas", position: { x: center.x + Math.round(Math.cos(angle) * 132), y: center.y + Math.round(Math.sin(angle) * 92) }, draggable: false, data: { label: resource.title, kind: "resource", resourceId: id, sourceUrl: resource.url, pinned: true, note: resource.source ? `来源 · ${resource.source}` : "馆藏记录", highlighted: hit, brightness: 0.82 } });
    resource.concepts.forEach((concept) => edges.push({ id: `catalogue:resource:${concept}:${id}`, source: catalogueCategoryId(concept), target: nodeId, type: "default", data: { system: true, relation: "真实内容关联" }, style: { stroke: "var(--atlas-edge-holding)", strokeWidth: 0.65, strokeOpacity: 0.36 } }));
  });
  return applyMemoryLayer(nodes, edges, memory, showMemory);
}

export function PersonalGraphWorkspace({ initialSession, initialGraph, publicGraphHash, focusedNodeId, focusUnavailable }: { initialSession: ResearchSession; initialGraph: MergedGraph; publicGraphHash: string; focusedNodeId?: string; focusUnavailable?: string }) {
  const router = useRouter();
  const [distanceScale, setDistanceScale] = useState(1);
  const [mapMode, setMapMode] = useState<"personal" | "catalogue">("personal");
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const [showMemory, setShowMemory] = useState(true);
  const [memory, setMemory] = useState<HybridMemoryInsights | null>(null);
  const initial = useMemo(() => {
    const flow = mapMode === "catalogue" ? toCatalogueFlow(initialSession, initialGraph, catalogueQuery, memory, showMemory) : toFlow(initialGraph, distanceScale, memory, showMemory);
    return { ...flow, nodes: flow.nodes.map((node) => ({ ...node, selected: node.id === focusedNodeId })) };
  }, [catalogueQuery, distanceScale, focusedNodeId, initialGraph, initialSession, mapMode, memory, showMemory]);
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

  useEffect(() => {
    fetch(`/api/v3/memory?sessionId=${encodeURIComponent(initialSession.id)}&query=${encodeURIComponent(initialSession.researchQuestion)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setMemory(data?.hybrid ?? null))
      .catch(() => setMemory(null));
  }, [initialSession.id, initialSession.researchQuestion]);

  useEffect(() => {
    if (dirty) return;
    const flow = mapMode === "catalogue" ? toCatalogueFlow(initialSession, initialGraph, catalogueQuery, memory, showMemory) : toFlow(initialGraph, distanceScale, memory, showMemory);
    setNodes(flow.nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId })));
    setEdges(flow.edges);
  }, [catalogueQuery, dirty, distanceScale, initialGraph, initialSession, mapMode, memory, selectedNodeId, showMemory]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => { if (mapMode === "catalogue") return; setNodes((current) => applyNodeChanges(changes, current)); if (changes.some((change) => change.type === "position" || change.type === "remove")) setDirty(true); }, [mapMode]);
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => { if (mapMode === "catalogue") return; setEdges((current) => applyEdgeChanges(changes, current)); if (changes.some((change) => change.type === "remove")) setDirty(true); }, [mapMode]);
  const onConnect = useCallback((connection: Connection) => {
    if (mapMode === "catalogue" || connection.source?.startsWith("memory:") || connection.target?.startsWith("memory:")) return;
    setEdges((current) => addEdge({ ...connection, id: `personal:${crypto.randomUUID()}`, type: "default", data: { system: false, relation: "个人关联" }, style: { stroke: "var(--atlas-edge-personal)", strokeWidth: 1.2, strokeOpacity: 0.58 } }, current));
    setDirty(true);
  }, [mapMode]);

  function updateSelected(patch: Partial<GraphData> & { hidden?: boolean }) {
    if (!selectedNodeId || mapMode === "catalogue" || selected?.data.kind === "memory") return;
    setNodes((current) => current.map((node) => node.id === selectedNodeId ? {
      ...node, hidden: patch.hidden ?? node.hidden, draggable: patch.pinned === undefined ? node.draggable : !patch.pinned,
      data: { ...node.data, ...patch },
    } : node));
    setDirty(true);
  }

  async function save() {
    setSaving(true); setMessage(null);
    const existing = session.personalGraph.nodeOverrides;
    const editableNodes = nodes.filter((node) => node.data.kind !== "memory" && !node.id.startsWith("catalogue-"));
    const nodeOverrides = Object.fromEntries(editableNodes.map((node) => [node.id, {
      ...existing[node.id], position: node.position, pinned: node.data.pinned, hidden: Boolean(node.hidden),
      label: node.data.label, note: node.data.note ?? "", updatedAt: new Date().toISOString(),
    }]));
    const hiddenSystemEdgeIds = initial.edges.filter((edge) => edge.data?.system && !edge.data?.memoryLayer && !edges.some((item) => item.id === edge.id)).map((edge) => edge.id);
    const personalEdges = edges.filter((edge) => !edge.data?.system).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, type: "personal_note" as const, label: typeof edge.label === "string" ? edge.label : undefined }));
    try {
      const response = await fetch(`/api/research/sessions/${session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: session.personalGraph.version, nodeOverrides, hiddenSystemEdgeIds, personalEdges }) });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? "另一窗口保存了更新。请刷新后重新应用本次修改。" : data.error?.message ?? "保存失败");
      setSession(data); setDirty(false); setMessage(`已保存个人知识层 v${data.personalGraph.version}。`);
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
    if (!selectedEdge || selectedEdge.data?.memoryLayer) return;
    setEdges((current) => current.filter((edge) => edge.id !== selectedEdge.id));
    setSelectedEdgeId(null); setDirty(true);
  }

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  return <div className="grid gap-3 xl:grid-cols-[1fr_330px]">
    <div className="atlas-canvas relative rf-cockpit h-[calc(100vh-10rem)] min-h-[590px] overflow-hidden border-y border-ink-border bg-ink-panel/50">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 border border-ink-border bg-ink/92 px-2.5 py-1.5"><MapIcon className="h-3.5 w-3.5 text-pulse" /><span className="font-display text-xs text-ivory">Knowledge Atlas</span><span className="font-mono text-[8px] text-steel-dim">{publicGraphHash.slice(0, 8)} · v{session.personalGraph.version}</span></div>
      <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1 border border-ink-border bg-ink/92 p-1"><button type="button" onClick={() => { setMapMode("personal"); setSelectedNodeId(focusedNodeId ?? "topic"); }} className={cn("px-2.5 py-1.5 text-[10px]", mapMode === "personal" ? "bg-pulse-faint text-pulse" : "text-steel")}>我的星图</button><button type="button" onClick={() => { setMapMode("catalogue"); setSelectedNodeId("catalogue-topic"); setSelectedEdgeId(null); }} className={cn("px-2.5 py-1.5 text-[10px]", mapMode === "catalogue" ? "bg-copper-faint text-copper" : "text-steel")}>馆藏总图</button><button type="button" aria-pressed={showMemory} onClick={() => setShowMemory((value) => !value)} className={cn("flex items-center gap-1 px-2.5 py-1.5 text-[10px]", showMemory ? "bg-copper-faint text-copper" : "text-steel")}><BrainCircuit className="h-3 w-3" />记忆图层</button></div>
      {mapMode === "catalogue" && <div className="absolute left-3 top-12 z-10 flex items-center gap-2 border border-ink-border bg-ink/92 p-2"><Search className="h-3.5 w-3.5 text-copper" /><input value={catalogueQuery} onChange={(event) => setCatalogueQuery(event.target.value)} placeholder="点亮类别或馆藏" className="w-44 bg-transparent text-xs text-ivory outline-none" /></div>}
      {focusUnavailable && <div role="alert" className="absolute left-3 top-10 z-10 rounded border border-copper/40 bg-ink/95 px-3 py-2 text-xs text-copper">目标资源 {focusUnavailable} 已失效或尚未投影；请回工作台重新生成。</div>}
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} connectionLineType={ConnectionLineType.Bezier} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }} onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }} fitView fitViewOptions={{ padding: 0.08, minZoom: 0.48, maxZoom: 1.15 }} minZoom={0.2} maxZoom={2} deleteKeyCode={null} nodesConnectable={mapMode === "personal"} panOnDrag>
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.7} color="var(--atlas-grid-dot)" />
        <FocusController nodeId={focusedNodeId} />
        <CatalogueViewportController active={mapMode === "catalogue"} nodeCount={nodes.length} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <aside className="space-y-3">
      <div className="border border-ink-border bg-ink-panel p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase text-steel">{mapMode === "personal" ? "个人知识投影" : "馆藏知识脉络"}</span><span className={cn("text-[10px]", dirty ? "text-copper" : "text-pulse")}>{dirty ? "未保存" : "已同步"}</span></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px] text-steel-dim"><span><b className="block text-sm text-ivory">{nodes.filter((node) => !node.hidden).length}</b>节点</span><span><b className="block text-sm text-ivory">{edges.length}</b>关系</span><span><b className="block text-sm text-copper">{memory?.retrieval.matches.length ?? 0}</b>记忆命中</span></div>
        {mapMode === "personal" && <Button variant="solid" className="mt-3 w-full" loading={saving} disabled={!dirty} onClick={save}><Save className="h-3.5 w-3.5" />保存个人知识层</Button>}
        {message && <p role="status" className="mt-2 text-xs leading-relaxed text-steel">{message}</p>}
      </div>

      <div className="border border-ink-border bg-ink-panel p-3">
        <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-steel"><span className="flex items-center gap-1"><Orbit className="h-3 w-3" />知识距离</span><span className="text-pulse">{distanceScale.toFixed(2)}x</span></div>
        <input type="range" min="0.65" max="1.6" step="0.05" value={distanceScale} onChange={(event) => setDistanceScale(Number(event.target.value))} className="cockpit-range mt-2" aria-label="星图距离" />
        <div className="mt-1 flex justify-between text-[9px] text-steel-dim"><span>相近</span><span>语义距离</span><span>遥远</span></div>
      </div>

      {selected && <div className="space-y-3 border border-ink-border bg-ink-panel p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase text-steel-dim">{kindName[selected.data.kind]}</span><LockKeyhole className="h-3 w-3 text-pulse" /></div>
        <div><h2 className="text-sm leading-relaxed text-ivory">{selected.data.label}</h2>{selected.data.note && <p className="mt-1 text-[10px] leading-relaxed text-steel-dim">{selected.data.note}</p>}</div>
        {selected.data.memoryReasons?.length ? <div className="border-l-2 border-copper/60 pl-3"><div className="mb-1 flex items-center gap-1 text-[10px] text-copper"><BrainCircuit className="h-3 w-3" />记忆如何影响此节点</div>{selected.data.memoryReasons.map((reason) => <p key={reason} className="text-[10px] leading-relaxed text-steel">{reason}</p>)}</div> : null}
        {mapMode === "personal" && selected.data.kind !== "memory" && <><label className="block space-y-1 text-xs text-steel">个人标签<Input value={selected.data.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label><label className="block space-y-1 text-xs text-steel">节点注释<textarea value={selected.data.note ?? ""} onChange={(event) => updateSelected({ note: event.target.value })} className="min-h-20 w-full border border-ink-border bg-ink-raise p-2 text-xs text-ivory outline-none focus:border-pulse/60" /></label></>}
        <div className="grid grid-cols-2 gap-2">
          {mapMode === "personal" && selected.data.kind !== "memory" && <><Button size="sm" onClick={() => updateSelected({ pinned: !selected.data.pinned })}>{selected.data.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}{selected.data.pinned ? "取消固定" : "固定位置"}</Button><Button size="sm" onClick={() => updateSelected({ hidden: true })}><EyeOff className="h-3 w-3" />隐藏节点</Button></>}
          <Button size="sm" variant="outline" loading={acting} onClick={() => act("search")}><Search className="h-3 w-3" />搜索此主题</Button>
          <Button size="sm" variant="copper" loading={acting} onClick={() => act("library")}><Library className="h-3 w-3" />查看主题馆藏</Button>
          {selected.data.resourceId && <Button size="sm" className="col-span-2" loading={acting} onClick={() => act("add_evidence", selected.data.resourceId)}><Link2 className="h-3 w-3" />加入证据篮子</Button>}
          {selected.data.resourceId && <Button size="sm" className="col-span-2" onClick={() => router.push(`/research/${encodeURIComponent(session.id)}/workbench?resourceId=${encodeURIComponent(selected.data.resourceId!)}&view=evidence`)}><Link2 className="h-3 w-3" />返回工作台证据/草稿</Button>}
          {selected.data.sourceUrl && <a href={selected.data.sourceUrl} target="_blank" rel="noreferrer noopener" className="col-span-2 flex items-center justify-center gap-1 border border-pulse/40 px-2 py-2 text-xs text-pulse hover:bg-pulse-faint/20">打开原始来源 <Link2 className="h-3 w-3" /></a>}
        </div>
      </div>}

      {selectedEdge && <div className="border border-ink-border bg-ink-panel p-3"><p className="text-xs text-steel">关系：{String(selectedEdge.data?.relation ?? selectedEdge.label ?? "语义关联")}</p>{selectedEdge.data?.memoryLayer ? <p className="mt-1 text-[10px] text-copper">这条边来自当前 RAG 召回，不写入个人覆盖层。</p> : <Button size="sm" variant="danger" className="mt-2 w-full" onClick={removeSelectedEdge}><Trash2 className="h-3 w-3" />{selectedEdge.data?.system ? "在个人层隐藏" : "删除个人关联"}</Button>}</div>}

      {nodes.some((node) => node.hidden) && <div className="rounded-lg border border-ink-border bg-ink-panel p-3"><div className="mb-2 flex items-center gap-1 font-mono text-[9px] uppercase text-steel-dim"><Eye className="h-3 w-3" />hidden nodes</div>{nodes.filter((node) => node.hidden).map((node) => <button key={node.id} className="block w-full truncate py-1 text-left text-xs text-steel hover:text-pulse" onClick={() => { setSelectedNodeId(node.id); setNodes((items) => items.map((item) => item.id === node.id ? { ...item, hidden: false } : item)); setDirty(true); }}>恢复 · {node.data.label}</button>)}</div>}

      {libraryResults.length > 0 && <div className="space-y-2 rounded-lg border border-copper/30 bg-ink-panel p-3"><div className="font-mono text-[9px] uppercase text-copper">topic holdings</div>{libraryResults.map((resource) => <div key={resource.id} className="rounded border border-ink-border p-2"><div className="text-xs text-ivory">{resource.title}</div><div className="mt-1 flex items-center justify-between"><span className="text-[9px] text-steel-dim">{resource.provenance.sourceLabel} · {resource.availability}</span><Button size="sm" onClick={() => act("add_evidence", resource.id, resource.title)} disabled={session.evidenceIds.includes(resource.id)}>{session.evidenceIds.includes(resource.id) ? "已选择" : "选为证据"}</Button></div></div>)}</div>}
    </aside>
  </div>;
}
