"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, Check, ExternalLink, MessageCircleMore, Send, Trash2, X } from "lucide-react";
import type { LivingBookCard } from "@/lib/types";
import { Button } from "@/components/ui/button";

type Conversation = {
  id: string;
  livingBookId: string;
  status: "pending" | "accepted" | "declined" | "closed";
  messages: Array<{ id: string; senderRole: "requester" | "living_book"; body: string; createdAt: string }>;
  sharedResources: Array<{ id: string; title: string; url: string; sourceLabel?: string }>;
  sharedAssets?: Array<{ id: string; assetId: string; sharedByRole: string }>;
  viewerRole?: "requester" | "living_book";
};

export function ConversationPanel({ livingBook, onClose }: { livingBook: LivingBookCard | null; onClose: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [opening, setOpening] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [shareTitle, setShareTitle] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [assets, setAssets] = useState<Array<{ id: string; originalName: string }>>([]);
  const [assetId, setAssetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v3/living-book/conversations")
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setConversations(Array.isArray(data) ? data : []))
      .catch(() => setConversations([]));
    fetch("/api/v3/knowledge-assets", { cache: "no-store" }).then((response) => response.ok ? response.json() : []).then((data) => setAssets(Array.isArray(data) ? data : [])).catch(() => setAssets([]));
  }, []);

  const incoming = conversations.filter((item) => item.viewerRole === "living_book" && item.status === "pending");
  async function decide(conversationId: string, decision: "accept" | "decline") {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/v3/living-book/conversations/${conversationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "无法处理请求");
      setConversations((items) => items.map((item) => item.id === payload.id ? payload : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法处理请求"); }
    finally { setLoading(false); }
  }
  async function revokeAsset(conversationId: string, sharedAssetId: string) {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/v3/living-book/conversations/${conversationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revokeAssetId: sharedAssetId }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "无法撤销资料授权");
      setConversations((items) => items.map((item) => item.id === payload.id ? payload : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法撤销资料授权"); }
    finally { setLoading(false); }
  }
  if (!livingBook) return incoming.length ? <aside className="self-start border border-ink-border bg-ink-raise/70 p-4 lg:sticky lg:top-4"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-copper"><MessageCircleMore className="h-3.5 w-3.5" />待处理交流</div><div className="mt-3 space-y-3">{incoming.map((item) => <div key={item.id} className="border border-copper/30 bg-copper/5 p-3"><p className="text-xs leading-relaxed text-steel">有人向你的匿名活馆藏发起了交流请求：</p><p className="mt-2 whitespace-pre-wrap text-xs text-ivory">{item.messages[0]?.body}</p><div className="mt-3 flex gap-2"><Button size="sm" variant="copper" loading={loading} onClick={() => void decide(item.id, "accept")}><Check className="h-3.5 w-3.5" />接受并聊天</Button><Button size="sm" variant="outline" disabled={loading} onClick={() => void decide(item.id, "decline")}>拒绝</Button></div></div>)}</div>{error && <p role="alert" className="mt-3 text-xs text-rosewood">{error}</p>}</aside> : null;
  const selectedBook = livingBook;
  const conversation = conversations.find((item) => item.livingBookId === selectedBook.id);
  const acceptsAsyncQuestions = selectedBook.willingTypes.includes("async_answer");

  async function createRequest() {
    if (!opening.trim()) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/v3/living-book/conversations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ livingBookId: selectedBook.id, message: topic ? `[交流主题：${topic}]\n${opening}` : opening }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "无法创建交流请求");
      setConversations((items) => [payload, ...items.filter((item) => item.id !== payload.id)]);
      setOpening("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法创建交流请求"); }
    finally { setLoading(false); }
  }

  async function sendMessage() {
    if (!conversation || !message.trim()) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/v3/living-book/conversations/${conversation.id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "message", body: message }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "无法发送消息");
      setConversations((items) => items.map((item) => item.id === payload.id ? payload : item));
      setMessage("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法发送消息"); }
    finally { setLoading(false); }
  }

  async function shareResource() {
    if (!conversation || !shareTitle.trim() || !shareUrl.trim()) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/v3/living-book/conversations/${conversation.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "resource", title: shareTitle, url: shareUrl }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "无法分享来源");
      setConversations((items) => items.map((item) => item.id === payload.id ? payload : item)); setShareTitle(""); setShareUrl("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法分享来源"); }
    finally { setLoading(false); }
  }

  async function shareAsset() {
    if (!conversation || !assetId) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/v3/living-book/conversations/${conversation.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "asset", assetId }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "无法分享资料");
      setConversations((items) => items.map((item) => item.id === payload.id ? payload : item)); setAssetId("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法分享资料"); }
    finally { setLoading(false); }
  }

  return (
    <aside className="self-start border border-ink-border bg-ink-raise/70 p-4 lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-copper"><MessageCircleMore className="h-3.5 w-3.5" /> consultation</div>
          <h2 className="mt-1 font-display text-base text-ivory">{selectedBook.displayName ?? "匿名 Living Book"}</h2>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-steel hover:text-ivory" aria-label="关闭交流面板"><X className="h-4 w-4" /></button>
      </div>

      {!acceptsAsyncQuestions && <p className="mt-4 text-xs leading-relaxed text-steel">这册活书没有开放文字答疑。可通过其标注的交流方式申请联系。</p>}

      {acceptsAsyncQuestions && !conversation && <div className="mt-4 space-y-3">
        <p className="text-xs leading-relaxed text-steel">选择希望交流的主题并写下第一个问题。对方接受前，身份与联系方式仍保持隔离。</p>
        <select value={topic} onChange={(event) => setTopic(event.target.value)} className="h-10 w-full border border-ink-border bg-ink px-2 text-sm text-ivory"><option value="">选择交流主题</option>{selectedBook.expertiseConcepts.map((concept) => <option key={concept.id} value={concept.name}>{concept.name}</option>)}</select>
        <textarea value={opening} onChange={(event) => setOpening(event.target.value)} maxLength={4000} rows={6} placeholder="我正在研究……想请教……" className="w-full resize-y border border-ink-border bg-ink p-2.5 text-sm text-ivory outline-none placeholder:text-steel-dim focus:border-pulse/60" />
        <Button variant="copper" size="sm" loading={loading} onClick={createRequest}><Send className="h-3.5 w-3.5" />提交交流请求</Button>
      </div>}

      {conversation && <div className="mt-4 space-y-3">
        <p className="border-l-2 border-copper/60 pl-2 text-xs leading-relaxed text-steel">{conversation.status === "pending" ? "已提交，等待活书所有者接受。接受前不能继续发送消息或共享资料。" : "双方已建立会话；共享的书目会带原始来源链接。"}</p>
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">{conversation.messages.map((entry) => <div key={entry.id} className={entry.senderRole === "requester" ? "border border-pulse/25 bg-pulse/5 p-2 text-xs text-steel" : "border border-copper/25 bg-copper/5 p-2 text-xs text-steel"}>{entry.body}</div>)}</div>
        {conversation.sharedResources.length > 0 && <div className="space-y-1.5 border-t border-ink-border pt-3">{conversation.sharedResources.map((resource) => <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-xs text-pulse hover:underline"><BookOpenCheck className="h-3.5 w-3.5" />{resource.title}<ExternalLink className="h-3 w-3" /></a>)}</div>}
        {conversation.sharedAssets && conversation.sharedAssets.length > 0 && <div className="space-y-1 border-t border-ink-border pt-3 text-xs text-steel">{conversation.sharedAssets.map((shared) => <div key={shared.id} className="flex items-center gap-2"><BookOpenCheck className="h-3.5 w-3.5 text-copper" /><a href={`/api/v3/living-book/conversations/${conversation.id}/assets/${encodeURIComponent(shared.assetId)}`} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-copper hover:underline">私有资料 · {assets.find((asset) => asset.id === shared.assetId)?.originalName ?? shared.assetId}</a>{shared.sharedByRole === conversation.viewerRole && <button type="button" aria-label="撤销资料授权" onClick={() => void revokeAsset(conversation.id, shared.assetId)} className="p-1 text-steel hover:text-rosewood"><Trash2 className="h-3.5 w-3.5" /></button>}</div>)}</div>}
        {conversation.status === "accepted" && <><div className="flex gap-2"><input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={8000} placeholder="输入消息" className="min-w-0 flex-1 border border-ink-border bg-ink px-2 text-sm text-ivory outline-none focus:border-pulse/60" /><Button variant="copper" size="sm" loading={loading} onClick={sendMessage}><Send className="h-3.5 w-3.5" /></Button></div><div className="grid gap-2 border-t border-ink-border pt-3 sm:grid-cols-[1fr_1.5fr_auto]"><input value={shareTitle} onChange={(event) => setShareTitle(event.target.value)} placeholder="分享书目标题" className="border border-ink-border bg-ink px-2 text-xs text-ivory outline-none focus:border-pulse/60" /><input value={shareUrl} onChange={(event) => setShareUrl(event.target.value)} placeholder="https://来源链接" className="border border-ink-border bg-ink px-2 text-xs text-ivory outline-none focus:border-pulse/60" /><Button size="sm" variant="outline" loading={loading} onClick={() => void shareResource}><BookOpenCheck className="h-3.5 w-3.5" />分享</Button></div>{assets.length > 0 && <div className="flex gap-2 border-t border-ink-border pt-3"><select value={assetId} onChange={(event) => setAssetId(event.target.value)} className="min-w-0 flex-1 border border-ink-border bg-ink px-2 text-xs text-ivory"><option value="">选择私有资料</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalName}</option>)}</select><Button size="sm" variant="outline" loading={loading} onClick={() => void shareAsset}>分享资料</Button></div>}</>}
      </div>}
      {error && <p role="alert" className="mt-3 text-xs text-rosewood">{error}</p>}
    </aside>
  );
}
