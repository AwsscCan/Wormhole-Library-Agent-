import { NextResponse } from "next/server";
import {
  discoverWritingEvidence,
  confirmWritingEvidence,
  listWritingCandidates,
  WritingDependencyUnavailableError,
  WritingError,
} from "@/lib/writing/draftService";
import { apiError, parseBody } from "@/lib/validation/api";
import { candidateSchema, confirmCandidateSchema } from "@/lib/validation/schemas";
import {
  privateWritingResponse,
  rejectWritingUserId,
  requireWritingPrincipal,
} from "@/lib/writing/routeSupport";
import { ensureAppComposition } from "@/lib/composition";

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
  if (process.env.NODE_ENV !== "test") await ensureAppComposition();
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

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "test") await ensureAppComposition();
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return privateWritingResponse(apiError("BAD_REQUEST", "sessionId is required", 400), principal);
  try {
    return privateWritingResponse(NextResponse.json(await listWritingCandidates({ principal, sessionId })), principal);
  } catch (error) { return failure(error, principal); }
}

export async function PATCH(request: Request) {
  if (process.env.NODE_ENV !== "test") await ensureAppComposition();
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const body = await parseBody(request, confirmCandidateSchema);
  if (!body.ok) return privateWritingResponse(body.response, principal);
  try {
    const confirmed = await confirmWritingEvidence({ principal, ...body.data });
    if (!confirmed) {
      return privateWritingResponse(apiError("BAD_REQUEST", "Candidate cannot be verified", 400), principal);
    }
    return privateWritingResponse(NextResponse.json(confirmed), principal);
  } catch (error) {
    return failure(error, principal);
  }
}
