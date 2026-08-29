import { NextResponse } from "next/server";
import { CcSwitchError, importCcSwitchPresets } from "@/lib/llm/ccSwitch";
import { apiError, parseBody } from "@/lib/validation/api";
import { ccSwitchImportSchema } from "@/lib/validation/schemas";
import { privateWritingResponse, rejectWritingUserId, requireWritingPrincipal } from "@/lib/writing/routeSupport";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const parsed = await parseBody(request, ccSwitchImportSchema);
  if (!parsed.ok) return privateWritingResponse(parsed.response, principal);
  try {
    return privateWritingResponse(NextResponse.json(await importCcSwitchPresets(principal, parsed.data.mode, parsed.data.selections)), principal);
  } catch (error) {
    const status = error instanceof CcSwitchError ? error.code === "NOT_FOUND" ? 404 : 400 : 500;
    return privateWritingResponse(error instanceof CcSwitchError ? apiError(error.code === "NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST", error.message, status) : apiError("INTERNAL_ERROR", "Unable to import CC Switch presets", 500), principal);
  }
}
