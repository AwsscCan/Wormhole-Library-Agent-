"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, ExternalLink, MessageCircleMore, Send, X } from "lucide-react";
import type { LivingBookCard } from "@/lib/types";
import { Button } from "@/components/ui/button";

type Conversation = {
  id: string;
  livingBookId: string;
  status: "pending" | "accepted" | "declined" | "closed";
  messages: Array<{ id: string; senderRole: "requester" | "living_book"; body: string; createdAt: string }>;
  sharedResources: Array<{ id: string; title: string; url: string; sourceLabel?: string }>;
};

export function ConversationPanel({ livingBook, onClose }: { livingBook: LivingBookCard | null; onClose: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [opening, setOpening] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v3/living-book/conversations")
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setConversations(Array.isArray(data) ? data : []))
      .catch(() => setConversations([]));
  }, []);

  if (!livingBook) return null;
  const selectedBook = livingBook;
  const conversation = conversations.find((item) => item.livingBookId === selectedBook.id);
  const acceptsAsyncQuestions = selectedBook.willingTypes.includes("async_answer");

  async function createRequest() {
    if (!opening.trim()) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/v3/living-book/conversations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ livingBookId: selectedBook.id, message: opening }),
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
        <p className="text-xs leading-relaxed text-steel">写下第一个问题。对方接受前，身份与联系方式仍保持隔离。</p>
        <textarea value={opening} onChange={(event) => setOpening(event.target.value)} maxLength={4000} rows={6} placeholder="我正在研究……想请教……" className="w-full resize-y border border-ink-border bg-ink p-2.5 text-sm text-ivory outline-none placeholder:text-steel-dim focus:border-pulse/60" />
        <Button variant="copper" size="sm" loading={loading} onClick={createRequest}><Send className="h-3.5 w-3.5" />提交交流请求</Button>
      </div>}

      {conversation && <div className="mt-4 space-y-3">
        <p className="border-l-2 border-copper/60 pl-2 text-xs leading-relaxed text-steel">{conversation.status === "pending" ? "已提交，等待活书所有者接受。接受前不能继续发送消息或共享资料。" : "双方已建立会话；共享的书目会带原始来源链接。"}</p>
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">{conversation.messages.map((entry) => <div key={entry.id} className={entry.senderRole === "requester" ? "border border-pulse/25 bg-pulse/5 p-2 text-xs text-steel" : "border border-copper/25 bg-copper/5 p-2 text-xs text-steel"}>{entry.body}</div>)}</div>
        {conversation.sharedResources.length > 0 && <div className="space-y-1.5 border-t border-ink-border pt-3">{conversation.sharedResources.map((resource) => <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-xs text-pulse hover:underline"><BookOpenCheck className="h-3.5 w-3.5" />{resource.title}<ExternalLink className="h-3 w-3" /></a>)}</div>}
        {conversation.status === "accepted" && <div className="flex gap-2"><input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={8000} placeholder="输入消息" className="min-w-0 flex-1 border border-ink-border bg-ink px-2 text-sm text-ivory outline-none focus:border-pulse/60" /><Button variant="copper" size="sm" loading={loading} onClick={sendMessage}><Send className="h-3.5 w-3.5" /></Button></div>}
      </div>}
      {error && <p role="alert" className="mt-3 text-xs text-rosewood">{error}</p>}
    </aside>
  );
}
