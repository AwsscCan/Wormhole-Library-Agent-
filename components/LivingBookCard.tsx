"use client";
/**
 * Living Book 档案卡：匿名、克制、有神秘感。
 * 不做社交软件头像风——这是"活馆藏档案"，不是好友推荐。
 */
import { useState } from "react";
import { UserRound, Archive, ShieldCheck, MessageCircleMore } from "lucide-react";
import type { LivingBookCard as LivingBookCardData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WILLING_LABEL: Record<string, string> = {
  async_answer: "文字答疑",
  coffee_chat: "15min 交流",
  project_review: "项目点评",
  reading_guide: "领读入门",
};

export function LivingBookCard({
  livingBook,
  userId,
  className,
  onConversation,
}: {
  livingBook: LivingBookCardData;
  userId: string;
  className?: string;
  onConversation?: (livingBook: LivingBookCardData) => void;
}) {
  const [state, setState] = useState<"idle" | "sending" | "pending">("idle");
  const anonymous = livingBook.displayMode !== "named" || !livingBook.displayName;

  async function requestContact() {
    if (onConversation) {
      onConversation(livingBook);
      return;
    }
    setState("sending");
    try {
      await fetch("/api/contact-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          personMatchId: livingBook.id,
          message: "想约一次 15 分钟的交流。",
        }),
      });
      setState("pending");
    } catch {
      setState("idle");
    }
  }

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-md border border-dashed border-copper/35 bg-ink-raise/60 p-3.5 transition-colors hover:border-copper/60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-copper">
          <Archive className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            living archive // {anonymous ? "anonymous" : "named"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[9.5px] text-steel-dim">
          VOL-{livingBook.id.replace(/^lb_/, "").toUpperCase().slice(0, 10)}
        </span>
      </div>

      <div className="mt-2.5 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-copper/30 bg-copper-faint/40">
          <UserRound className="h-4 w-4 text-copper" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-display text-[14px] text-ivory">
            {anonymous ? "匿名 Living Book" : livingBook.displayName}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-steel line-clamp-2">
            {livingBook.headline}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {livingBook.expertiseConcepts.map((c) => (
          <Badge key={c.id} tone="copper">
            {c.name}
          </Badge>
        ))}
        {livingBook.willingTypes.map((t) => (
          <Badge key={t} tone="steel">
            {WILLING_LABEL[t] ?? t}
          </Badge>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[10.5px] text-steel-dim">
          <ShieldCheck className="h-3 w-3 shrink-0 text-pulse-dim" />
          <span className="truncate">双方同意前不互换身份与联系方式</span>
        </span>
        {state === "pending" ? (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-pulse">
            ✓ request pending
          </span>
        ) : (
          <Button
            size="sm"
            variant="copper"
            loading={state === "sending"}
            onClick={requestContact}
            className="shrink-0"
          >
            <MessageCircleMore className="h-3 w-3" />
            匿名请求交流
          </Button>
        )}
      </div>
    </article>
  );
}
