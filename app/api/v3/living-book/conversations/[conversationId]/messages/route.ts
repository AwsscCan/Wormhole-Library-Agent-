import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { guestCookieHeader, type CurrentPrincipal } from "@/lib/auth/principal";
import { parseBody } from "@/lib/validation/api";
import {
  LivingBookConversationError,
  sendConversationMessage,
  shareConversationResource,
  shareConversationAsset,
} from "@/lib/livingLibrary/conversations";

const messageSchema = z.object({ type: z.literal("message"), body: z.string().min(1).max(8_000) }).strict();
const resourceSchema = z.object({
  type: z.literal("resource"), title: z.string().min(1).max(300), url: z.string().min(1).max(2_048), sourceLabel: z.string().max(120).optional(),
}).strict();
const assetSchema = z.object({ type: z.literal("asset"), assetId: z.string().min(1).max(160) }).strict();
const bodySchema = z.discriminatedUnion("type", [messageSchema, resourceSchema, assetSchema]);

function response(body: unknown, status: number, principal?: CurrentPrincipal, request?: Request) {
  const result = NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const cookie = principal && guestCookieHeader(principal, request);
  if (cookie) result.headers.append("Set-Cookie", cookie);
  return result;
}

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const resolved = await requirePrincipal(request);
  if (!("principal" in resolved)) return resolved.response;
  const principal = resolved.principal;
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { conversationId } = await context.params;
    const conversation = parsed.data.type === "message"
      ? await sendConversationMessage(principal, conversationId, parsed.data.body)
      : parsed.data.type === "resource"
        ? await shareConversationResource(principal, conversationId, parsed.data)
        : await shareConversationAsset(principal, conversationId, parsed.data.assetId);
    return response(conversation, 200, principal, request);
  } catch (error) {
    if (error instanceof LivingBookConversationError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
      return response({ error: { code: error.code, message: error.message } }, status, principal, request);
    }
    return response({ error: { code: "INTERNAL_ERROR", message: "Unable to update this conversation" } }, 500, principal, request);
  }
}
