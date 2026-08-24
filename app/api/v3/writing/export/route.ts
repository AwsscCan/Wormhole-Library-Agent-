import {
  exportEvidenceDraft,
  WritingDependencyUnavailableError,
  WritingError,
} from "@/lib/writing/draftService";
import { WritingStateError } from "@/lib/writing/stateMachine";
import { apiError, parseBody } from "@/lib/validation/api";
import { exportArtifactSchema } from "@/lib/validation/schemas";
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
  return privateWritingResponse(apiError("INTERNAL_ERROR", "Unable to export draft", 500), principal);
}

export async function POST(request: Request) {
  const rejected = rejectWritingUserId(request);
  if (rejected) return rejected;
  const principal = await requireWritingPrincipal(request);
  if (principal instanceof Response) return principal;
  const body = await parseBody(request, exportArtifactSchema);
  if (!body.ok) return privateWritingResponse(body.response, principal);
  try {
    const { markdown } = await exportEvidenceDraft({ ...body.data, principal });
    return privateWritingResponse(new Response(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="evidence-bound-draft.md"',
      },
    }), principal);
  } catch (error) {
    return failure(error, principal);
  }
}
