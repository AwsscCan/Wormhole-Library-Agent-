import { NextResponse } from "next/server";
import { ResearchError } from "./types";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
export function privateJson(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: PRIVATE_HEADERS }); }
const messages: Record<ResearchError["code"], string> = {
  NOT_FOUND: "Research session not found", CONFLICT: "Research workspace changed concurrently",
  BAD_REQUEST: "Invalid research workspace request", EXPIRED_INTERACTION: "Legacy interaction expired",
  SOURCE_FAILURE: "Research source is temporarily unavailable", AUTH_REQUIRED: "A member or guest workspace is required",
  PRINCIPAL_UNAVAILABLE: "Identity service is temporarily unavailable",
};
export function researchError(error: unknown) {
  if (error instanceof ResearchError) {
    const status = error.code === "NOT_FOUND" || error.code === "EXPIRED_INTERACTION" ? 404
      : error.code === "CONFLICT" ? 409 : error.code === "BAD_REQUEST" ? 400 : error.code === "AUTH_REQUIRED" ? 401 : 503;
    return privateJson({ error: { code: error.code, message: messages[error.code] } }, status);
  }
  return privateJson({ error: { code: "INTERNAL_ERROR", message: "Unexpected research workspace error" } }, 500);
}
