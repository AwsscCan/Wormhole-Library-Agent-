import { NextResponse } from "next/server";
import { guestCookieHeader } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { LivingBookConversationError, readConversationAsset } from "@/lib/livingLibrary/conversations";

export async function GET(request: Request, context: { params: Promise<{ conversationId: string; assetId: string }> }) {
  const resolved = await requirePrincipal(request);
  if (!("principal" in resolved)) return resolved.response;
  try {
    const params = await context.params;
    const asset = await readConversationAsset(resolved.principal, params.conversationId, params.assetId);
    const response = new NextResponse(asset.bytes, { status: 200, headers: {
      "Content-Type": asset.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
      "Cache-Control": "private, no-store",
    } });
    const cookie = guestCookieHeader(resolved.principal, request);
    if (cookie) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    if (error instanceof LivingBookConversationError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Unable to read shared asset" } }, { status: 500 });
  }
}
