import { NextResponse } from "next/server";
import { ResearchError } from "./types";

export function researchError(error: unknown) {
  if (error instanceof ResearchError) {
    const status = error.code === "NOT_FOUND" || error.code === "EXPIRED_INTERACTION" ? 404 : error.code === "CONFLICT" ? 409 : error.code === "BAD_REQUEST" ? 400 : 503;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "unknown error" } }, { status: 500 });
}
