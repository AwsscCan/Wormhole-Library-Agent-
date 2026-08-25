import type { CurrentPrincipal } from "./types";
import { ResearchError } from "./types";

/** Read-only cross-package port. Package 01 owns cookie/session validation. */
export interface CurrentPrincipalPort { read(request: Request): Promise<CurrentPrincipal | null>; }
const ports = globalThis as unknown as { __package01CurrentPrincipalPort?: CurrentPrincipalPort };

/** Called by package 01 integration bootstrap; package 03 never parses credentials itself. */
export function bindPackage01CurrentPrincipalPort(port: CurrentPrincipalPort) { ports.__package01CurrentPrincipalPort = port; }
export async function requireCurrentPrincipal(request: Request): Promise<CurrentPrincipal> {
  const port = ports.__package01CurrentPrincipalPort;
  if (!port) throw new ResearchError("PRINCIPAL_UNAVAILABLE", "Package 01 current principal port is unavailable");
  const principal = await port.read(request);
  if (!principal) throw new ResearchError("AUTH_REQUIRED", "A member or guest workspace is required");
  return principal;
}
export function principalOwnerKey(principal: CurrentPrincipal): string { return `${principal.mode}:${principal.id}`; }
export function installCurrentPrincipalPortForTests(port: CurrentPrincipalPort) {
  if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test") throw new Error("Test principal injection is disabled outside tests");
  bindPackage01CurrentPrincipalPort(port);
}
export function clearCurrentPrincipalPortForTests() { delete ports.__package01CurrentPrincipalPort; }
