import { NextResponse } from "next/server";
import { guestCookieHeader, type CurrentPrincipal } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { NoteRepositoryError, softDeleteNote, updateNote } from "@/lib/notes/noteRepository";
import { apiError, parseBody } from "@/lib/validation/api";
import { updateNoteSchema } from "@/lib/validation/schemas";

type RouteContext = { params: Promise<{ noteId: string }> };

function privateResponse(response: Response, principal?: CurrentPrincipal): Response {
  response.headers.set("Cache-Control", "private, no-store");
  const cookie = principal && guestCookieHeader(principal);
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}

function repositoryErrorResponse(error: unknown): Response | null {
  if (!(error instanceof NoteRepositoryError)) return null;
  if (error.code === "NOT_FOUND") return apiError("NOT_FOUND", "Note not found", 404);
  return apiError("CONFLICT", "Note version conflict", 409);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const result = await requirePrincipal(request);
  if ("response" in result) return privateResponse(result.response);

  const parsed = await parseBody(request, updateNoteSchema);
  if (!parsed.ok) return privateResponse(parsed.response, result.principal);

  try {
    const { noteId } = await context.params;
    const { expectedVersion, ...patch } = parsed.data;
    const note = await updateNote(result.principal.id, noteId, expectedVersion, patch);
    return privateResponse(NextResponse.json(note), result.principal);
  } catch (error) {
    const response = repositoryErrorResponse(error);
    if (response) return privateResponse(response, result.principal);
    return privateResponse(apiError("INTERNAL_ERROR", "Unable to update note", 500), result.principal);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const result = await requirePrincipal(request);
  if ("response" in result) return privateResponse(result.response);

  try {
    const { noteId } = await context.params;
    await softDeleteNote(result.principal.id, noteId);
    return privateResponse(new Response(null, { status: 204 }), result.principal);
  } catch (error) {
    const response = repositoryErrorResponse(error);
    if (response) return privateResponse(response, result.principal);
    return privateResponse(apiError("INTERNAL_ERROR", "Unable to delete note", 500), result.principal);
  }
}
