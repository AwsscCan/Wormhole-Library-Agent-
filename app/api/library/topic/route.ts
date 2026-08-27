/**
 * POST /api/library/topic —— 主题馆藏联邦查询（v3.2 package 02）
 *
 * 请求：{ topic: string, limit?: number(1..50) }
 * 响应：LibraryTopicResponse（items / failures / failureMessages / degraded / sources）
 * 错误：统一 { error: { code, message } }（冻结契约风格）
 */
import { NextResponse } from "next/server";
import { apiError, parseBody } from "@/lib/validation/api";
import { libraryTopicRequestSchema } from "@/lib/validation/schemas";
import { getTopicLibrary } from "@/lib/federation/topicLibrary";

export async function POST(request: Request) {
  const parsed = await parseBody(request, libraryTopicRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await getTopicLibrary(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    return apiError(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "unknown error",
      500,
    );
  }
}

/** GET /api/library/topic?topic=xxx&limit=12 —— 快捷查询（同 POST 语义） */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");
  if (!topic) {
    return apiError("BAD_REQUEST", "topic is required", 400);
  }
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
    return apiError("BAD_REQUEST", "limit must be an integer in [1, 50]", 400);
  }
  try {
    const result = await getTopicLibrary({ topic, limit });
    return NextResponse.json(result);
  } catch (e) {
    return apiError(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "unknown error",
      500,
    );
  }
}
