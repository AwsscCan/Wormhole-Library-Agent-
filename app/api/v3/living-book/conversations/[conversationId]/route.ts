import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { apiError, parseBody } from "@/lib/validation/api";
import { LivingBookConversationError, respondToConversation, revokeConversationAsset } from "@/lib/livingLibrary/conversations";

const decisionSchema = z.union([
  z.object({ decision: z.enum(["accept", "decline"]) }).strict(),
  z.object({ revokeAssetId: z.string().min(1).max(160) }).strict(),
]);
export async function PATCH(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const resolved = await requirePrincipal(request);
  if (!("principal" in resolved)) return resolved.response;
  const parsed = await parseBody(request, decisionSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const conversationId = (await context.params).conversationId;
    const result = "decision" in parsed.data
      ? await respondToConversation(resolved.principal, conversationId, parsed.data.decision)
      : await revokeConversationAsset(resolved.principal, conversationId, parsed.data.revokeAssetId);
    return NextResponse.json(result);
  }
  catch (error) {
    if (error instanceof LivingBookConversationError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400 });
    return apiError("INTERNAL_ERROR", "无法处理交流请求", 500);
  }
}
