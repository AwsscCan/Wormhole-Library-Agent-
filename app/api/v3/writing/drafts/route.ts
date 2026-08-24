import { NextResponse } from "next/server";
import {
  generateEvidenceDraft,
  requireOwnedResearchSession,
  WritingDependencyUnavailableError,
  WritingError,
} from "@/lib/writing/draftService";
import { resumeWriting } from "@/lib/writing/repository";
import { apiError, parseBody } from "@/lib/validation/api";
import { createDraftSchema } from "@/lib/validation/schemas";
import {
  privateWritingResponse,
  rejectWritingUserId,
  requireWritingPrincipal,
} from "@/lib/writing/routeSupport";

function failure(error: unknown, principal: import("@/lib/auth/principal").CurrentPrincipal) {
  if (error instanceof WritingDependencyUnavailableError) {
    return privateWritingResponse(apiError("DEPENDENCY_UNAVAILABLE", "Writing dependencies are not configured", 503), principal);
  }
  if (error instanceof WritingError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
    return privateWritingResponse(apiError(error.code, error.message, status), principal);
  }
  return privateWritingResponse(apiError("INTERNAL_ERROR", "Unable to generate draft", 500), principal);
}

export async function GET(request: Request) {
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return privateWritingResponse(apiError("BAD_REQUEST", "sessionId is required", 400), principal);
  try {
    await requireOwnedResearchSession(principal, sessionId);
    return privateWritingResponse(NextResponse.json(await resumeWriting(principal.id, sessionId)), principal);
  } catch (error) {
    return failure(error, principal);
  }
}

export async function POST(request: Request) {
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const parsed = await parseBody(request, createDraftSchema);
  if (!parsed.ok) return privateWritingResponse(parsed.response, principal);
  try {
    const draft = await generateEvidenceDraft({ ...parsed.data, principal });
    return privateWritingResponse(NextResponse.json(draft, { status: 201 }), principal);
  } catch (error) {
    return failure(error, principal);
  }
}
