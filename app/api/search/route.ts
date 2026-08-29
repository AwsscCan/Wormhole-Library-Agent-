import { ensureAppComposition } from "@/lib/composition";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { parseBody } from "@/lib/validation/api";
import { searchRequestSchema } from "@/lib/validation/schemas";
import { privateJson, researchError } from "@/lib/research/api";
import { principalOwnerKey, requireCurrentPrincipal } from "@/lib/research/principal";
import { ResearchError } from "@/lib/research/types";

export async function POST(request: Request) {
  await ensureAppComposition();
  const parsed = await parseBody(request, searchRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const principal = await requireCurrentPrincipal(request);
    const result = await getOrchestrator().search({ ...parsed.data, userId: principalOwnerKey(principal) });
    return privateJson(result, 200, principal, request);
  } catch (error) { return researchError(error); }
}

/** Legacy compatibility: only the principal that created an interaction may read it. */
export async function GET(request: Request) {
  try {
    if (process.env.NODE_ENV !== "test") await ensureAppComposition();
    const { searchParams } = new URL(request.url);
    const interactionId = searchParams.get("interactionId");
    if (!interactionId) throw new ResearchError("BAD_REQUEST", "interactionId is required");
    const principal = await requireCurrentPrincipal(request);
    const ownerId = principalOwnerKey(principal);
    const interaction = getOrchestrator().getInteraction(interactionId);
    if (!interaction || (interaction.userId !== ownerId && interaction.userId !== principal.id)) {
      throw new ResearchError("NOT_FOUND", "Research interaction not found");
    }
    return privateJson(interaction.searchResponse);
  } catch (error) { return researchError(error); }
}
