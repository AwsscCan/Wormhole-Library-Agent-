import { NextResponse } from "next/server";
import { listRedactedCcSwitchCatalog } from "@/lib/llm/ccSwitch";
import { privateWritingResponse, rejectWritingUserId, requireWritingPrincipal } from "@/lib/writing/routeSupport";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  return privateWritingResponse(NextResponse.json(await listRedactedCcSwitchCatalog()), principal);
}
