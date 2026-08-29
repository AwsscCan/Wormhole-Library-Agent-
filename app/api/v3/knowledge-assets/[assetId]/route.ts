import { NextResponse } from "next/server";
import { guestCookieHeader } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { deleteKnowledgeAsset, KnowledgeAssetError } from "@/lib/knowledge/assets";

export async function DELETE(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const resolved = await requirePrincipal(request);
  if (!("principal" in resolved)) return resolved.response;
  const principal = resolved.principal;
  try {
    const { assetId } = await context.params;
    await deleteKnowledgeAsset(principal, assetId);
    const response = new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
    const cookie = guestCookieHeader(principal, request); if (cookie) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    const status = error instanceof KnowledgeAssetError && error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: { code: error instanceof KnowledgeAssetError ? error.code : "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Unable to delete knowledge asset" } }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
