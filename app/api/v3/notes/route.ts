import { NextResponse } from "next/server";
import { guestCookieHeader, type CurrentPrincipal } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { createNote, listNotes } from "@/lib/notes/noteRepository";
import { apiError, parseBody } from "@/lib/validation/api";
import { createNoteSchema } from "@/lib/validation/schemas";

function privateResponse(response: Response, principal?: CurrentPrincipal): Response {
  response.headers.set("Cache-Control", "private, no-store");
  const cookie = principal && guestCookieHeader(principal);
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}

export async function GET(request: Request): Promise<Response> {
  const result = await requirePrincipal(request);
  if ("response" in result) return privateResponse(result.response);

  try {
    return privateResponse(NextResponse.json(await listNotes(result.principal.id)), result.principal);
  } catch {
    return privateResponse(apiError("INTERNAL_ERROR", "Unable to list notes", 500), result.principal);
  }
}

export async function POST(request: Request): Promise<Response> {
  const result = await requirePrincipal(request);
  if ("response" in result) return privateResponse(result.response);

  const parsed = await parseBody(request, createNoteSchema);
  if (!parsed.ok) return privateResponse(parsed.response, result.principal);

  try {
    const note = await createNote(result.principal.id, parsed.data);
    return privateResponse(NextResponse.json(note, { status: 201 }), result.principal);
  } catch {
    return privateResponse(apiError("INTERNAL_ERROR", "Unable to create note", 500), result.principal);
  }
}
