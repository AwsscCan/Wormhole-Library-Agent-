"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Database, ExternalLink, Route, Sparkles } from "lucide-react";
import type { WormholesResponse } from "@/lib/types";
import type { SessionSearch } from "@/lib/research/types";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ResourceCard } from "@/components/ResourceCard";
import { SerendipitySlider } from "@/components/SerendipitySlider";

export default function ResearchExplorePage({ params }: {
  params: Promise<{ sessionId: string; interactionId: string }>;
}) {
  const { sessionId, interactionId } = use(params);
  const searchParams = useSearchParams();
  const [search, setSearch] = useState<SessionSearch | null>(null);
  const [result, setResult] = useState<WormholesResponse | null>(null);
  const requestedSlider = Number(searchParams.get("slider"));
  const [slider, setSlider] = useState(Number.isInteger(requestedSlider) && requestedSlider >= 0 && requestedSlider <= 100 ? requestedSlider : 60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    fetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/searches/${encodeURIComponent(interactionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? "无法从研究会话恢复检索");
        return data as SessionSearch;
      }).then(setSearch).catch((cause) => setError(cause instanceof Error ? cause.message : "无法恢复检索"));
  }, [sessionId, interactionId]);

  async function generate() {
    if (!search) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/research/sessions/${encodeURIComponent(sessionId)}/wormholes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId, startConceptIds: search.concepts.map((concept) => concept.id), sliderValue: slider, maxPaths: 3 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "虫洞生成失败");
      setResult({ wormholes: data.wormholes });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "虫洞生成失败"); }
    finally { setBusy(false); }
  }

  const externalCount = search?.resources.filter((resource) => Boolean(resource.sourceUrl)).length ?? 0;
  const sourceCounts = search?.resources.reduce<Record<string, number>>((counts, resource) => {
    const label = resource.sourceLabel ?? "馆藏";
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {}) ?? {};

  return <div className="space-y-4">
    <div className="flex items-center gap-3">
      <Link href={`/research/${encodeURIComponent(sessionId)}/map`} className="flex items-center gap-1 font-mono text-[10px] uppercase text-steel hover:text-pulse"><ArrowLeft className="h-3 w-3" />research map</Link>
      <h1 className="font-display text-lg text-ivory">{search?.query ?? "恢复研究探索"}</h1>
    </div>
    <Panel>
      <PanelHeader icon={Route} title="session wormholes · 会话虫洞" accent="cyan" />
      <PanelBody className="space-y-4">
        <p className="text-xs text-steel">虫洞由当前服务器身份生成并写回同一研究会话；页面不提交 ownerId 或 userId。</p>
        <SerendipitySlider value={slider} onChange={setSlider} />
        <Button variant="solid" loading={busy} disabled={!search} onClick={generate}>生成并保存虫洞</Button>
        {error && <p role="alert" className="text-xs text-rosewood">{error}</p>}
      </PanelBody>
    </Panel>
    {search && <Panel>
      <PanelHeader icon={Database} title="search results · 本次检索结果" accent="copper" right={<Link href={`/research/${encodeURIComponent(sessionId)}/workbench`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-pulse/40 px-3 text-xs text-pulse hover:bg-pulse/10"><Sparkles className="h-3.5 w-3.5" />生成推荐</Link>} />
      <PanelBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel">
          <span>共取得 {search.resources.length} 条候选 · 按相关性排序</span>
          <span className={externalCount ? "text-pulse" : "text-copper"}>{externalCount ? `${externalCount} 条可打开外部来源` : "本次未取得外部来源"}</span>
          {Object.entries(sourceCounts).map(([label, count]) => <span key={label} className="font-mono text-[9px] text-copper">{label} {count}</span>)}
        </div>
        {search.resources.length === 0 ? <p className="rounded-md border border-dashed border-ink-edge p-4 text-xs text-steel">没有找到匹配资源。请换用更具体的主题，或在设置中确认网络可访问公共馆藏。</p> : <div className="grid gap-2 md:grid-cols-2">
          {search.resources.slice(0, visibleCount).map((resource) => <article key={resource.id} className="rounded-md border border-ink-border bg-ink-raise/60 p-3">
            <h2 className="line-clamp-2 text-sm leading-snug text-ivory">{resource.title}</h2>
            <p className="mt-1 font-mono text-[10px] text-copper">{resource.sourceLabel ?? "馆藏检索结果"}</p>
            {resource.sourceUrl ? <a href={resource.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-[11px] text-pulse hover:underline"><ExternalLink className="h-3 w-3" />打开原始文献页面</a> : <p className="mt-2 text-[11px] text-steel-dim">此条来自本地离线索引，暂无外部跳转地址。</p>}
          </article>)}
        </div>}
        {visibleCount < search.resources.length && <Button variant="outline" className="w-full" onClick={() => setVisibleCount((count) => count + 12)}>加载更多相关结果 · 还剩 {search.resources.length - visibleCount} 条</Button>}
      </PanelBody>
    </Panel>}
    {result?.wormholes.map((wormhole) => <article key={wormhole.id} className="rounded-lg border border-pulse/30 bg-ink-panel p-4">
      <h2 className="font-display text-base text-pulse">{wormhole.destination}</h2>
      <p className="mt-1 text-xs text-steel">{wormhole.path.join(" → ")}</p>
      <p className="mt-2 text-xs leading-relaxed text-ivory">{wormhole.explanation}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">{wormhole.resources.map((resource) => <ResourceCard key={resource.id} resource={resource} compact />)}</div>
    </article>)}
  </div>;
}
