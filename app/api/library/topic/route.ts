import { NextResponse } from "next/server";
import { apiError, parseBody } from "@/lib/validation/api";
import { queryTopicLibrary } from "@/lib/research/catalogPort";
import { libraryTopicRequestSchema } from "@/lib/validation/schemas";
import { getTopicLibrary } from "@/lib/federation/topicLibrary";

export async function POST(request: Request) {
  const parsed = await parseBody(request, libraryTopicRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json(await getTopicLibrary(parsed.data));
  } catch (error) {
    return apiError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "unknown error",
      500,
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const topic = url.searchParams.get("topic")?.trim();
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue ? Number(limitValue) : undefined;
  if (topic) {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
      return apiError("BAD_REQUEST", "limit must be an integer in [1, 50]", 400);
    }
    try {
      return NextResponse.json(await getTopicLibrary({ topic, limit }));
    } catch (error) {
      return apiError(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "unknown error",
        500,
      );
    }
  }

  const query = url.searchParams.get("query")?.trim() ?? "";
  const result = await queryTopicLibrary({
    query,
    ...(Number.isFinite(limit) && limit ? { limit } : {}),
  });
  return NextResponse.json(result);
}
