"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Route } from "lucide-react";
import type { SearchResponse, WormholesResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ResourceCard } from "@/components/ResourceCard";
import { SerendipitySlider } from "@/components/SerendipitySlider";

export default function ResearchExplorePage({ params }: {
  params: Promise<{ sessionId: string; interactionId: string }>;
}) {
  const { sessionId, interactionId } = use(params);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [result, setResult] = useState<WormholesResponse | null>(null);
  const [slider, setSlider] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/search?interactionId=${encodeURIComponent(interactionId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("这次检索已过期，请回研究星图重新搜索。");
        return response.json() as Promise<SearchResponse>;
      }).then(setSearch).catch((cause) => setError(cause instanceof Error ? cause.message : "无法恢复检索"));
  }, [interactionId]);

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
    {result?.wormholes.map((wormhole) => <article key={wormhole.id} className="rounded-lg border border-pulse/30 bg-ink-panel p-4">
      <h2 className="font-display text-base text-pulse">{wormhole.destination}</h2>
      <p className="mt-1 text-xs text-steel">{wormhole.path.join(" → ")}</p>
      <p className="mt-2 text-xs leading-relaxed text-ivory">{wormhole.explanation}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">{wormhole.resources.map((resource) => <ResourceCard key={resource.id} resource={resource} compact />)}</div>
    </article>)}
  </div>;
}
