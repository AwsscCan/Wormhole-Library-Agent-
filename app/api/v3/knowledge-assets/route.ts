import { NextResponse } from "next/server";
import { guestCookieHeader, type CurrentPrincipal } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { createKnowledgeAsset, KnowledgeAssetError, listKnowledgeAssets, type AssetRetention } from "@/lib/knowledge/assets";

function privateResponse(body: unknown, status: number, principal: CurrentPrincipal, request: Request) {
  const response = NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const cookie = guestCookieHeader(principal, request); if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}
function errorResponse(error: unknown, principal: CurrentPrincipal, request: Request) {
  if (error instanceof KnowledgeAssetError) return privateResponse({ error: { code: error.code, message: error.message } }, error.code === "TOO_LARGE" ? 413 : error.code === "NOT_FOUND" ? 404 : 400, principal, request);
  return privateResponse({ error: { code: "INTERNAL_ERROR", message: "Unable to manage knowledge assets" } }, 500, principal, request);
}
async function current(request: Request) {
  const resolved = await requirePrincipal(request);
  return "principal" in resolved ? resolved.principal : null;
}

export async function GET(request: Request) {
  const principal = await current(request);
  if (!principal) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unable to resolve workspace identity" } }, { status: 401 });
  try { return privateResponse(await listKnowledgeAssets(principal), 200, principal, request); }
  catch (error) { return errorResponse(error, principal, request); }
}

export async function POST(request: Request) {
  const principal = await current(request);
  if (!principal) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unable to resolve workspace identity" } }, { status: 401 });
  try {
    const body = await request.formData();
    const file = body.get("file");
    const retention = body.get("retention") === "library" ? "library" : "temporary" as AssetRetention;
    if (!(file instanceof File)) throw new KnowledgeAssetError("BAD_REQUEST", "A file is required");
    return privateResponse(await createKnowledgeAsset(principal, file, retention), 201, principal, request);
  } catch (error) { return errorResponse(error, principal, request); }
}
