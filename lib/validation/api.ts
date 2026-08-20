/**
 * API helper（队友01）：统一错误格式 + zod 校验包装
 */
import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import type { ApiError } from "@/lib/types";

export function apiError(
  code: ApiError["error"]["code"],
  message: string,
  status: number,
): NextResponse<ApiError> {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse<ApiError> }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { ok: false, response: apiError("BAD_REQUEST", "Invalid JSON body", 400) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError("BAD_REQUEST", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 400),
    };
  }
  return { ok: true, data: parsed.data };
}
