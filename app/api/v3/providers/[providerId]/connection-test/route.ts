import { getOwnedProvider, ProviderError } from "@/lib/llm/providerRepository";
import { apiError } from "@/lib/validation/api";
import { privateWritingResponse, rejectWritingUserId, requireWritingPrincipal } from "@/lib/writing/routeSupport";
const attempts = new Map<string, number>();
export async function POST(request: Request, context: { params: Promise<{ providerId: string }> }) {
  const rejected = rejectWritingUserId(request); if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request); if (principal instanceof Response) return principal;
  const key = `${principal.id}:${(await context.params).providerId}`; const now = Date.now(); const last = attempts.get(key) ?? 0;
  if (now - last < 60_000) return privateWritingResponse(apiError("BAD_REQUEST", "Connection test is temporarily rate limited", 429), principal); attempts.set(key, now);
  try { await getOwnedProvider(principal, (await context.params).providerId); return privateWritingResponse(apiError("BAD_REQUEST", "Connection tests require an authorized server adapter", 400), principal); }
  catch (error) { return privateWritingResponse(error instanceof ProviderError ? apiError(error.code, "Unable to test provider connection", error.code === "NOT_FOUND" ? 404 : 400) : apiError("INTERNAL_ERROR", "Unable to test provider connection", 500), principal); }
}
