import { getOwnedProviderSecret, ProviderError } from "@/lib/llm/providerRepository";
import { testProviderConnection } from "@/lib/llm/providerAdapter";
import { apiError } from "@/lib/validation/api";
import { privateWritingResponse, rejectWritingUserId, requireWritingPrincipal } from "@/lib/writing/routeSupport";
const attempts = new Map<string, number>();
export async function POST(request: Request, context: { params: Promise<{ providerId: string }> }) {
  const rejected = rejectWritingUserId(request); if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request); if (principal instanceof Response) return principal;
  const body = await request.text();
  if (body.trim()) return privateWritingResponse(apiError("BAD_REQUEST", "Connection test does not accept a request body", 400), principal);
  const key = `${principal.id}:${(await context.params).providerId}`; const now = Date.now(); const last = attempts.get(key) ?? 0;
  if (now - last < 60_000) return privateWritingResponse(new Response(JSON.stringify({ error: { code: "BAD_REQUEST", message: "Connection test is temporarily rate limited" } }), { status: 429, headers: { "content-type": "application/json", "Retry-After": "60" } }), principal); attempts.set(key, now);
  try { const { provider, apiKey } = await getOwnedProviderSecret(principal, (await context.params).providerId); await testProviderConnection(provider, apiKey); return privateWritingResponse(new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }), principal); }
  catch (error) { return privateWritingResponse(error instanceof ProviderError ? apiError(error.code, "Unable to test provider connection", error.code === "NOT_FOUND" ? 404 : 400) : apiError("INTERNAL_ERROR", "Unable to test provider connection", 500), principal); }
}
