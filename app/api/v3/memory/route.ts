import { NextResponse } from "next/server";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { principalOwnerKey } from "@/lib/research/principal";
import { forgetOwnerMemory } from "@/lib/research/memory";
import {
  privateWritingResponse,
  rejectWritingUserId,
  requireWritingPrincipal,
} from "@/lib/writing/routeSupport";

export async function GET(request: Request) {
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const result = await getOrchestrator().memory(principalOwnerKey(principal));
  return privateWritingResponse(NextResponse.json(result), principal);
}

export async function DELETE(request: Request) {
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const ownerId = principalOwnerKey(principal);
  await forgetOwnerMemory(ownerId);
  const result = await getOrchestrator().resetMemory(ownerId);
  return privateWritingResponse(NextResponse.json(result), principal);
}
