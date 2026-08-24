import { NextResponse } from "next/server";
import { createNote, listNotes } from "@/lib/notes/noteRepository";
import {
  privateNoteResponse,
  rejectClientUserIdQuery,
  requireNotePrincipal,
} from "@/lib/notes/routeSupport";
import { apiError, parseBody } from "@/lib/validation/api";
import { createNoteSchema } from "@/lib/validation/schemas";

export async function GET(request: Request): Promise<Response> {
  const rejectedQuery = rejectClientUserIdQuery(request);
  if (rejectedQuery) return rejectedQuery;
  const principal = await requireNotePrincipal(request);
  if (principal instanceof Response) return principal;

  try {
    return privateNoteResponse(NextResponse.json(await listNotes(principal.id)), principal);
  } catch {
    return privateNoteResponse(apiError("INTERNAL_ERROR", "Unable to list notes", 500), principal);
  }
}

export async function POST(request: Request): Promise<Response> {
  const rejectedQuery = rejectClientUserIdQuery(request);
  if (rejectedQuery) return rejectedQuery;
  const principal = await requireNotePrincipal(request);
  if (principal instanceof Response) return principal;

  const parsed = await parseBody(request, createNoteSchema);
  if (!parsed.ok) return privateNoteResponse(parsed.response, principal);

  try {
    const note = await createNote(principal.id, parsed.data);
    return privateNoteResponse(NextResponse.json(note, { status: 201 }), principal);
  } catch {
    return privateNoteResponse(apiError("INTERNAL_ERROR", "Unable to create note", 500), principal);
  }
}
