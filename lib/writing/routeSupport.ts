import { guestCookieHeader, type CurrentPrincipal } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { apiError } from "@/lib/validation/api";

export function privateWritingResponse(response: Response, principal?: CurrentPrincipal): Response {
  response.headers.set("Cache-Control", "private, no-store");
  const cookie = principal && guestCookieHeader(principal); if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}
export function rejectWritingUserId(request: Request): Response | null {
  if (new URL(request.url).searchParams.has("userId")) return privateWritingResponse(apiError("BAD_REQUEST", "userId must not be supplied by the client", 400));
  return null;
}
export async function requireWritingPrincipal(request: Request): Promise<CurrentPrincipal | Response> {
  try { const value = await requirePrincipal(request); return "principal" in value ? value.principal : privateWritingResponse(value.response); }
  catch { return privateWritingResponse(apiError("INTERNAL_ERROR", "Unable to resolve identity", 500)); }
}
