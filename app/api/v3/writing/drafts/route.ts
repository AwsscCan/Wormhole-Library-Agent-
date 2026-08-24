import { NextResponse } from "next/server";
import { generateEvidenceDraft, WritingError } from "@/lib/writing/draftService";
import { apiError, parseBody } from "@/lib/validation/api";
import { createDraftSchema } from "@/lib/validation/schemas";
import { privateWritingResponse, rejectWritingUserId, requireWritingPrincipal } from "@/lib/writing/routeSupport";
export async function POST(request: Request) { const rejected = rejectWritingUserId(request); if (rejected) return rejected; const principal = await requireWritingPrincipal(request); if (principal instanceof Response) return principal; const parsed = await parseBody(request, createDraftSchema); if (!parsed.ok) return privateWritingResponse(parsed.response, principal); try { return privateWritingResponse(NextResponse.json(await generateEvidenceDraft({ ...parsed.data, principal }), { status: 201 }), principal); } catch (error) { return privateWritingResponse(error instanceof WritingError ? apiError(error.code, error.message, error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400) : apiError("INTERNAL_ERROR", "Unable to generate draft", 500), principal); } }
