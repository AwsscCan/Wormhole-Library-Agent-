import { NextResponse } from "next/server";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { apiError, parseBody } from "@/lib/validation/api";
import { feedbackRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const parsed = await parseBody(request, feedbackRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await getOrchestrator().feedback(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    return apiError("INTERNAL_ERROR", e instanceof Error ? e.message : "unknown error", 500);
  }
}
