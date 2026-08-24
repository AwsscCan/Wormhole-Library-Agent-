import { apiError } from "@/lib/validation/api";
import {
  AuthConfigurationError,
  type CurrentPrincipal,
  resolveCurrentPrincipal,
} from "@/lib/auth/principal";

export async function requirePrincipal(
  request: Request,
  options: { memberOnly?: boolean } = {},
): Promise<{ principal: CurrentPrincipal } | { response: Response }> {
  try {
    const principal = await resolveCurrentPrincipal(request);
    if (options.memberOnly && principal.mode !== "member") {
      return { response: apiError("UNAUTHORIZED", "Authentication is required", 401) };
    }
    return { principal };
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return { response: apiError("INTERNAL_ERROR", "Authentication is not configured", 500) };
    }
    throw error;
  }
}
