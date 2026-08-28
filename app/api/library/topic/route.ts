import { NextResponse } from "next/server";
import { queryTopicLibrary } from "@/lib/research/catalogPort";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() ?? "";
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue ? Number(limitValue) : undefined;
  const result = await queryTopicLibrary({
    query,
    ...(Number.isFinite(limit) && limit ? { limit } : {}),
  });
  return NextResponse.json(result);
}
