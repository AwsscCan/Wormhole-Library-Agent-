import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Map } from "lucide-react";
import { PersonalGraphWorkspace } from "@/components/PersonalGraphWorkspace";
import { buildSystemGraph, hashPublicGraph, mergePersonalGraph } from "@/lib/research/personalGraph";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import { projectWorkbenchResources, resolveFocusedResource } from "@/lib/workbench/projection";
import { getWorkbenchService } from "@/lib/workbench/store";

export const dynamic = "force-dynamic";

export default async function ResearchMapPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ resourceId?: string }> }) {
  const { sessionId } = await params;
  const query = await searchParams;
  try {
    const requestHeaders = await headers();
    const principal = await requireCurrentPrincipal(new Request("http://local/research", { headers: requestHeaders }));
    const session = await getResearchSessionService().get(principalOwnerKey(principal), sessionId);
    const systemGraph = buildSystemGraph(session);
    const workbench = await getWorkbenchService().get(principalOwnerKey(principal), sessionId);
    const displayGraph = projectWorkbenchResources(systemGraph, workbench.resourceProjections);
    const focus = resolveFocusedResource(displayGraph, query.resourceId);
    return <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3"><Link href="/research" className="flex items-center gap-1 font-mono text-[10px] uppercase text-steel hover:text-pulse"><ArrowLeft className="h-3 w-3" />research</Link><h1 className="flex items-center gap-2 font-display text-lg text-ivory"><Map className="h-5 w-5 text-pulse" />{session.writingTopic ?? session.researchQuestion}</h1><span className="ml-auto text-xs text-steel-dim">{session.evidenceIds.length} 条证据</span></div>
      <PersonalGraphWorkspace initialSession={session} initialGraph={mergePersonalGraph(displayGraph, session.personalGraph)} publicGraphHash={hashPublicGraph(systemGraph)} focusedNodeId={focus.nodeId ?? undefined} focusUnavailable={focus.status === "unavailable" ? query.resourceId : undefined} />
    </div>;
  } catch {
    return <div className="mx-auto max-w-lg rounded-lg border border-rosewood/30 bg-ink-panel p-8 text-center"><p className="text-sm text-rosewood">找不到这个研究会话，或它不属于当前工作区。</p><Link href="/research" className="mt-3 inline-flex text-xs text-pulse hover:underline">返回研究工作区</Link></div>;
  }
}
