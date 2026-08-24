import type { CurrentPrincipal } from "./types";

/**
 * Package 01 integration seam. This module deliberately does not implement authentication.
 * Package 01 can replace this resolver with its server session/guest resolver without changing
 * the research store or routes. The environment-backed principal is development-only.
 */
export async function getCurrentPrincipal(request: Request): Promise<CurrentPrincipal> {
  void request;
  const mode = process.env.RESEARCH_PRINCIPAL_MODE === "member" ? "member" : "guest";
  return { id: process.env.RESEARCH_PRINCIPAL_ID ?? "demo-user", mode };
}

export function principalOwnerKey(principal: CurrentPrincipal): string {
  return `${principal.mode}:${principal.id}`;
}
