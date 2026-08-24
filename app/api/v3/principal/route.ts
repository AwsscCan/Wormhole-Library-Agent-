import { NextResponse } from "next/server";
import { guestCookieHeader } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";

/**
 * Guest-capable V3 identity bootstrap endpoint. It never accepts a client
 * userId and is the response boundary that persists new guest sessions.
 */
export async function GET(request: Request): Promise<Response> {
  const result = await requirePrincipal(request);
  if ("response" in result) return result.response;

  const response = NextResponse.json({ principal: result.principal });
  const cookie = guestCookieHeader(result.principal);
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}
