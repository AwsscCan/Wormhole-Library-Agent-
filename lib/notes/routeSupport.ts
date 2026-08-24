import { guestCookieHeader, type CurrentPrincipal } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { apiError } from "@/lib/validation/api";

export function privateNoteResponse(response: Response, principal?: CurrentPrincipal): Response {
  response.headers.set("Cache-Control", "private, no-store");
  const cookie = principal && guestCookieHeader(principal);
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}

export function rejectClientUserIdQuery(request: Request): Response | null {
  if (!new URL(request.url).searchParams.has("userId")) return null;
  return privateNoteResponse(apiError("BAD_REQUEST", "userId must not be supplied by the client", 400));
}

export async function requireNotePrincipal(request: Request): Promise<CurrentPrincipal | Response> {
  try {
    const result = await requirePrincipal(request);
    if ("response" in result) return privateNoteResponse(result.response);
    return result.principal;
  } catch {
    return privateNoteResponse(apiError("INTERNAL_ERROR", "Unable to resolve note identity", 500));
  }
}
