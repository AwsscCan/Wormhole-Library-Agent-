import { NextResponse } from "next/server";
import { ensureAppComposition } from "@/lib/composition";
import {
  requireOwnedResearchSession,
  WritingDependencyUnavailableError,
  WritingError,
} from "@/lib/writing/draftService";
import { principalOwnerKey } from "@/lib/research/principal";
import { persistStage, resumeWriting } from "@/lib/writing/repository";
import { WritingStateError } from "@/lib/writing/stateMachine";
import { apiError, parseBody } from "@/lib/validation/api";
import { writingStageSchema } from "@/lib/validation/schemas";
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
  if (error instanceof WritingStateError) {
    return privateWritingResponse(apiError("BAD_REQUEST", "Writing stage transition is invalid", 400), principal);
  }
  return privateWritingResponse(apiError("INTERNAL_ERROR", "Unable to advance writing", 500), principal);
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "test") await ensureAppComposition();
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return privateWritingResponse(apiError("BAD_REQUEST", "sessionId is required", 400), principal);
  try {
    await requireOwnedResearchSession(principal, sessionId);
    return privateWritingResponse(NextResponse.json(await resumeWriting(principalOwnerKey(principal), sessionId)), principal);
  } catch (error) {
    return failure(error, principal);
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "test") await ensureAppComposition();
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const body = await parseBody(request, writingStageSchema);
  if (!body.ok) return privateWritingResponse(body.response, principal);
  try {
    await requireOwnedResearchSession(principal, body.data.sessionId);
    if (["draft", "evidence_link", "human_review", "export"].includes(body.data.stage)) {
      throw new WritingError("BAD_REQUEST", "Protected artifact stages require their dedicated server operation");
    }
    const checkpoint = await persistStage(principalOwnerKey(principal), body.data.sessionId, body.data.stage, body.data.content);
    return privateWritingResponse(NextResponse.json(checkpoint, { status: 201 }), principal);
  } catch (error) {
    return failure(error, principal);
  }
}
