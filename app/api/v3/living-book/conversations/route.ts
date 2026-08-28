import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { guestCookieHeader, type CurrentPrincipal } from "@/lib/auth/principal";
import { apiError, parseBody } from "@/lib/validation/api";
import {
  createConversationRequest,
  listConversations,
  LivingBookConversationError,
} from "@/lib/livingLibrary/conversations";

const requestSchema = z.object({
  livingBookId: z.string().min(1).max(160),
  message: z.string().min(1).max(4_000),
}).strict();

function response(body: unknown, status: number, principal?: CurrentPrincipal, request?: Request) {
  const result = NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const cookie = principal && guestCookieHeader(principal, request);
  if (cookie) result.headers.append("Set-Cookie", cookie);
  return result;
}

function failure(error: unknown, principal: CurrentPrincipal, request: Request) {
  if (error instanceof LivingBookConversationError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
    return response({ error: { code: error.code, message: error.message } }, status, principal, request);
  }
  return response({ error: { code: "INTERNAL_ERROR", message: "Unable to manage Living Book conversations" } }, 500, principal, request);
}

async function principalFor(request: Request) {
  const resolved = await requirePrincipal(request);
  return "principal" in resolved ? resolved.principal : null;
}

export async function GET(request: Request) {
  const principal = await principalFor(request);
  if (!principal) return apiError("UNAUTHORIZED", "Unable to resolve workspace identity", 401);
  try {
    return response(await listConversations(principal), 200, principal, request);
  } catch (error) {
    return failure(error, principal, request);
  }
}

export async function POST(request: Request) {
  const principal = await principalFor(request);
  if (!principal) return apiError("UNAUTHORIZED", "Unable to resolve workspace identity", 401);
  const parsed = await parseBody(request, requestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return response(await createConversationRequest(principal, parsed.data.livingBookId, parsed.data.message), 201, principal, request);
  } catch (error) {
    return failure(error, principal, request);
  }
}
