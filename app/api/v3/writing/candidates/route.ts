import { NextResponse } from "next/server";
import {
  discoverWritingEvidence,
  requireOwnedResearchSession,
  WritingDependencyUnavailableError,
  WritingError,
} from "@/lib/writing/draftService";
import { confirmCandidate } from "@/lib/writing/repository";
import { apiError, parseBody } from "@/lib/validation/api";
import { candidateSchema, confirmCandidateSchema } from "@/lib/validation/schemas";
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
  return privateWritingResponse(apiError("INTERNAL_ERROR", "Unable to manage writing candidates", 500), principal);
}

export async function POST(request: Request) {
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const body = await parseBody(request, candidateSchema);
  if (!body.ok) return privateWritingResponse(body.response, principal);
  try {
    const candidates = await discoverWritingEvidence({ ...body.data, principal });
    return privateWritingResponse(NextResponse.json({ candidates }, { status: 201 }), principal);
  } catch (error) {
    return failure(error, principal);
  }
}

export async function PATCH(request: Request) {
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const body = await parseBody(request, confirmCandidateSchema);
  if (!body.ok) return privateWritingResponse(body.response, principal);
  try {
    await requireOwnedResearchSession(principal, body.data.sessionId);
    const confirmed = await confirmCandidate(principal.id, body.data.sessionId, body.data.evidenceId);
    if (!confirmed) {
      return privateWritingResponse(apiError("BAD_REQUEST", "Candidate cannot be verified", 400), principal);
    }
    return privateWritingResponse(NextResponse.json(confirmed), principal);
  } catch (error) {
    return failure(error, principal);
  }
}
