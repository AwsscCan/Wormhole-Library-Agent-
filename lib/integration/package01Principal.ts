import { resolveCurrentPrincipal } from "@/lib/auth/principal";
import { bindPackage01CurrentPrincipalPort } from "@/lib/research/principal";

/**
 * Connects P01's authoritative server-side identity resolver to the P03/P05
 * research boundary.  Credential parsing remains entirely inside P01.
 */
export function bindPackage01ServerPrincipal(): void {
  bindPackage01CurrentPrincipalPort({ read: resolveCurrentPrincipal });
}
