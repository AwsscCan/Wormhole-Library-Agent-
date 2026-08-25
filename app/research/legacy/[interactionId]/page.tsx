"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ResearchLegacyMigrationPage({ params }: { params: Promise<{ interactionId: string }> }) {
  const { interactionId } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/research/migrations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interactionId }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.code === "EXPIRED_INTERACTION"
        ? "这次旧检索已过期，但你可以创建新会话后从主题节点重新搜索。" : data.error?.message ?? "无法迁移旧地图");
      router.replace(`/research/${encodeURIComponent(data.sessionId)}/map`);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "无法迁移旧地图"));
  }, [interactionId, router]);
  if (error) return <div className="mx-auto max-w-lg rounded-lg border border-rosewood/30 bg-ink-panel p-8 text-center"><p className="text-sm text-rosewood">{error}</p><Link href="/research" className="mt-3 inline-flex items-center gap-1 text-xs text-pulse hover:underline"><ArrowLeft className="h-3 w-3" />进入研究工作区</Link></div>;
  return <div className="flex h-64 items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-steel-dim"><Loader2 className="h-4 w-4 animate-spin text-pulse" />migrating legacy map…</div>;
}
