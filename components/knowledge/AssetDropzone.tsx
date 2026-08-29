"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, LibraryBig, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Asset = { id: string; originalName: string; mimeType: string; byteSize: number; retention: "temporary" | "library"; expiresAt?: string; extractionStatus: string };

function size(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export function AssetDropzone({ selectedIds = [], onSelectionChange, compact = false, sessionId }: { selectedIds?: string[]; onSelectionChange?: (ids: string[]) => void; compact?: boolean; sessionId?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [retention, setRetention] = useState<Asset["retention"]>("temporary");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = async () => {
    const response = await fetch("/api/v3/knowledge-assets", { cache: "no-store" });
    if (response.ok) { const data = await response.json(); setAssets(Array.isArray(data) ? data : []); }
  };
  useEffect(() => { void load().catch(() => setMessage("暂时无法读取已上传资料。")); }, []);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file); form.set("retention", retention);
      const response = await fetch("/api/v3/knowledge-assets", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "上传失败");
      setAssets((items) => [data as Asset, ...items]);
      let activitySessionId = sessionId;
      if (!activitySessionId && compact) {
        const sessionsResponse = await fetch("/api/research/sessions", { cache: "no-store" });
        if (sessionsResponse.ok) activitySessionId = ((await sessionsResponse.json()) as { sessions?: Array<{ id: string }> }).sessions?.[0]?.id;
      }
      if (activitySessionId) void fetch(`/api/research/sessions/${encodeURIComponent(activitySessionId)}/activity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "upload", title: file.name, resourceId: `asset:${data.id}` }) });
      setMessage(retention === "library" ? "已加入私有知识库。" : "已临时保存，将在 30 天后自动清理。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "上传失败"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/v3/knowledge-assets/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("删除失败");
      setAssets((items) => items.filter((asset) => asset.id !== id));
    } catch (error) { setMessage(error instanceof Error ? error.message : "删除失败"); }
    finally { setBusy(false); }
  }
  return <section className="border border-ink-border bg-ink-panel p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-display text-base text-ivory"><FileUp className="h-4 w-4 text-copper" />资料与知识库</h2><p className="mt-1 text-xs text-steel">TXT、Markdown、CSV、JSON、BibTeX、PDF、DOCX，单个文件不超过 25 MB。</p></div><Button size="sm" variant="copper" loading={busy} onClick={() => input.current?.click()}><FileUp className="h-3.5 w-3.5" />上传资料</Button></div>
    <input ref={input} type="file" accept=".txt,.md,.csv,.json,.bib,.pdf,.docx" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setRetention("temporary")} className={`border px-3 py-1.5 text-xs ${retention === "temporary" ? "border-pulse bg-pulse-faint text-pulse" : "border-ink-border text-steel"}`}>临时资料 · 30 天</button><button type="button" onClick={() => setRetention("library")} className={`flex items-center gap-1 border px-3 py-1.5 text-xs ${retention === "library" ? "border-copper bg-copper-faint text-copper" : "border-ink-border text-steel"}`}><LibraryBig className="h-3 w-3" />私有知识库</button></div>
    {message && <p role="status" className="mt-2 text-xs text-steel">{message}</p>}
    {assets.length > 0 && <div className="mt-3 divide-y divide-ink-border border-y border-ink-border">{assets.map((asset) => <div key={asset.id} className="flex items-center gap-2 py-2"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={selectedIds.includes(asset.id)} onChange={() => onSelectionChange?.(selectedIds.includes(asset.id) ? selectedIds.filter((id) => id !== asset.id) : [...selectedIds, asset.id])} disabled={!onSelectionChange} className="h-3.5 w-3.5 accent-pulse" /><span className="min-w-0"><span className="block truncate text-xs text-ivory">{asset.originalName}</span><span className="block text-[10px] text-steel-dim">{size(asset.byteSize)} · {asset.retention === "library" ? "私有知识库" : `至 ${asset.expiresAt ? new Date(asset.expiresAt).toLocaleDateString() : "30 天后"}`} · {asset.extractionStatus === "extracted" ? "可供写作读取" : "保留原文件"}</span></span></label><button type="button" aria-label={`删除 ${asset.originalName}`} onClick={() => void remove(asset.id)} className="p-1 text-steel hover:text-rosewood"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
    {compact && onSelectionChange && <p className="mt-2 text-[10px] text-steel-dim">勾选资料后，它们会作为本次写作运行的受限上下文。当前已选 {selectedIds.length} 项。</p>}
  </section>;
}
