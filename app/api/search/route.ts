import { NextResponse } from "next/server";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { apiError, parseBody } from "@/lib/validation/api";
import { searchRequestSchema } from "@/lib/validation/schemas";
import { privateJson, researchError } from "@/lib/research/api";
import { principalOwnerKey, requireCurrentPrincipal } from "@/lib/research/principal";
import { ResearchError } from "@/lib/research/types";

export async function POST(request: Request) {
  const parsed = await parseBody(request, searchRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await getOrchestrator().search(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    return apiError("INTERNAL_ERROR", e instanceof Error ? e.message : "unknown error", 500);
  }
}

/** Legacy compatibility: only the principal that created an interaction may read it. */
export async function GET(request: Request) {
  try {
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
