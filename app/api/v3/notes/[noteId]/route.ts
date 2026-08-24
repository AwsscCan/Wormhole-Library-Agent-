import { NextResponse } from "next/server";
import { NoteRepositoryError, softDeleteNote, updateNote } from "@/lib/notes/noteRepository";
import {
  privateNoteResponse,
  rejectClientUserIdQuery,
  requireNotePrincipal,
} from "@/lib/notes/routeSupport";
import { apiError, parseBody } from "@/lib/validation/api";
import { updateNoteSchema } from "@/lib/validation/schemas";

type RouteContext = { params: Promise<{ noteId: string }> };

function repositoryErrorResponse(error: unknown): Response | null {
  if (!(error instanceof NoteRepositoryError)) return null;
  if (error.code === "NOT_FOUND") return apiError("NOT_FOUND", "Note not found", 404);
  return apiError("CONFLICT", "Note version conflict", 409);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const rejectedQuery = rejectClientUserIdQuery(request);
  if (rejectedQuery) return rejectedQuery;
  const principal = await requireNotePrincipal(request);
  if (principal instanceof Response) return principal;

  const parsed = await parseBody(request, updateNoteSchema);
  if (!parsed.ok) return privateNoteResponse(parsed.response, principal);

  try {
    const { noteId } = await context.params;
    const { expectedVersion, ...patch } = parsed.data;
    const note = await updateNote(principal.id, noteId, expectedVersion, patch);
    return privateNoteResponse(NextResponse.json(note), principal);
  } catch (error) {
    const response = repositoryErrorResponse(error);
    if (response) return privateNoteResponse(response, principal);
    return privateNoteResponse(apiError("INTERNAL_ERROR", "Unable to update note", 500), principal);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const rejectedQuery = rejectClientUserIdQuery(request);
  if (rejectedQuery) return rejectedQuery;
  const principal = await requireNotePrincipal(request);
  if (principal instanceof Response) return principal;

  try {
    const { noteId } = await context.params;
    await softDeleteNote(principal.id, noteId);
    return privateNoteResponse(new Response(null, { status: 204 }), principal);
  } catch (error) {
    const response = repositoryErrorResponse(error);
    if (response) return privateNoteResponse(response, principal);
    return privateNoteResponse(apiError("INTERNAL_ERROR", "Unable to delete note", 500), principal);
  }
}
