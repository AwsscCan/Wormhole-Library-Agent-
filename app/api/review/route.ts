import { NextResponse } from "next/server";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { apiError, parseBody } from "@/lib/validation/api";
import { reviewRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const parsed = await parseBody(request, reviewRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json(await getOrchestrator().review(parsed.data));
  } catch (error) {
    return apiError("NOT_FOUND", error instanceof Error ? error.message : "review sources not found", 404);
  }
}
