import { NextResponse } from "next/server";
import { ensureAppComposition } from "@/lib/composition";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { principalOwnerKey } from "@/lib/research/principal";
import { buildHybridMemoryInsights, forgetOwnerMemory } from "@/lib/research/memory";
import {
  privateWritingResponse,
  rejectWritingUserId,
  requireWritingPrincipal,
} from "@/lib/writing/routeSupport";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "test") await ensureAppComposition();
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const ownerId = principalOwnerKey(principal);
  const url = new URL(request.url);
  const [result, hybrid] = await Promise.all([
    getOrchestrator().memory(ownerId),
    buildHybridMemoryInsights(ownerId, {
      sessionId: url.searchParams.get("sessionId") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
    }),
  ]);
  return privateWritingResponse(NextResponse.json({ ...result, hybrid }), principal);
}

export async function DELETE(request: Request) {
  if (process.env.NODE_ENV !== "test") await ensureAppComposition();
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const ownerId = principalOwnerKey(principal);
  await forgetOwnerMemory(ownerId);
  const [result, hybrid] = await Promise.all([
    getOrchestrator().resetMemory(ownerId),
    buildHybridMemoryInsights(ownerId),
  ]);
  return privateWritingResponse(NextResponse.json({ ...result, hybrid }), principal);
}
