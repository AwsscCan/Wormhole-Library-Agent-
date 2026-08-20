import { NextResponse } from "next/server";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { apiError } from "@/lib/validation/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return apiError("BAD_REQUEST", "userId is required", 400);
  return NextResponse.json(await getOrchestrator().memory(userId));
}

/** demo reset：一键重置 demo 用户记忆 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return apiError("BAD_REQUEST", "userId is required", 400);
  return NextResponse.json(await getOrchestrator().resetMemory(userId));
}
