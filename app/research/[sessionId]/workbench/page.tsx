import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Compass } from "lucide-react";
import { ExplorationWorkbench } from "@/components/ExplorationWorkbench";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { explainPrivateWorkspaceError } from "@/lib/research/failures";
import { getWorkbenchService } from "@/lib/workbench/store";
import type { WorkbenchView } from "@/lib/workbench/viewModel";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ view?: string; resourceId?: string; noteId?: string }> }) {
  const { sessionId } = await params;
  const query = await searchParams;
  try {
    const requestHeaders = await headers();
    const principal = await requireCurrentPrincipal(new Request("http://local/research/workbench", { headers: requestHeaders }));
    const state = await getWorkbenchService().get(principalOwnerKey(principal), sessionId);
    return <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><Link href={`/research/${encodeURIComponent(sessionId)}/map`} className="flex items-center gap-1 font-mono text-[10px] uppercase text-steel hover:text-pulse"><ArrowLeft className="h-3 w-3" />research map</Link><h1 className="flex items-center gap-2 font-display text-lg text-ivory"><Compass className="h-5 w-5 text-pulse" />可解释探索工作台</h1><span className="ml-auto text-[10px] text-steel-dim">private user layer · session {sessionId}</span></div>
      <ExplorationWorkbench initialState={state} initialView={(["reading", "concept", "evidence"].includes(query.view ?? "") ? query.view : "reading") as WorkbenchView} focusedResourceId={query.resourceId} focusedNoteId={query.noteId} />
    </div>;
  } catch (error) {
    return <div className="mx-auto max-w-lg rounded-lg border border-rosewood/30 bg-ink-panel p-8 text-center"><p className="text-sm text-rosewood">{explainPrivateWorkspaceError(error)}</p><Link href="/research" className="mt-3 inline-flex text-xs text-pulse hover:underline">返回研究工作区</Link></div>;
  }
}
