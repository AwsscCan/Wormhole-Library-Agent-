import { NextResponse } from "next/server";
import { researchError } from "@/lib/research/api";
import { getCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { createResearchSessionSchema } from "@/lib/research/schemas";
import { getResearchSessionService } from "@/lib/research/sessionStore";

export async function GET(request: Request) {
  try {
    const ownerId = principalOwnerKey(await getCurrentPrincipal(request));
    return NextResponse.json({ sessions: await getResearchSessionService().list(ownerId) });
  } catch (error) { return researchError(error); }
}

export async function POST(request: Request) {
  try {
    const body = createResearchSessionSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: body.error.message } }, { status: 400 });
    const ownerId = principalOwnerKey(await getCurrentPrincipal(request));
    const session = await getResearchSessionService().create(ownerId, body.data);
    return NextResponse.json(session, { status: 201 });
  } catch (error) { return researchError(error); }
}
