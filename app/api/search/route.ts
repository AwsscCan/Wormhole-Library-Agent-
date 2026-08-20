import { NextResponse } from "next/server";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { apiError, parseBody } from "@/lib/validation/api";
import { searchRequestSchema } from "@/lib/validation/schemas";

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

/** integration extension: 按 interactionId 取回已有搜索结果（Explore 页刷新用） */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const interactionId = searchParams.get("interactionId");
  if (!interactionId) return apiError("BAD_REQUEST", "interactionId is required", 400);
  const interaction = getOrchestrator().getInteraction(interactionId);
  if (!interaction) return apiError("NOT_FOUND", `interaction ${interactionId} not found`, 404);
  return NextResponse.json(interaction.searchResponse);
}
