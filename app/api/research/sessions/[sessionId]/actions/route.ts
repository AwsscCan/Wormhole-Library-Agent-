import { NextResponse } from "next/server";
import { researchError } from "@/lib/research/api";
import { getCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchWorkspace } from "@/lib/research/runtime";
import { nodeActionSchema } from "@/lib/research/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const body = nodeActionSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: body.error.message } }, { status: 400 });
    const ownerId = principalOwnerKey(await getCurrentPrincipal(request));
    return NextResponse.json(await getResearchWorkspace().act(ownerId, sessionId, body.data));
  } catch (error) { return researchError(error); }
}
