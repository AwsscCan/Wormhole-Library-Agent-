import { NextResponse } from "next/server";
import { researchError } from "@/lib/research/api";
import { buildSystemGraph, hashPublicGraph, mergePersonalGraph } from "@/lib/research/personalGraph";
import { getCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { graphUpdateSchema } from "@/lib/research/schemas";
import { getResearchSessionService } from "@/lib/research/sessionStore";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { sessionId } = await params;
    const ownerId = principalOwnerKey(await getCurrentPrincipal(request));
    const session = await getResearchSessionService().get(ownerId, sessionId);
    const systemGraph = buildSystemGraph(session);
    return NextResponse.json({ session, graph: mergePersonalGraph(systemGraph, session.personalGraph), publicGraphHash: hashPublicGraph(systemGraph) });
  } catch (error) { return researchError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { sessionId } = await params;
    const body = graphUpdateSchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: body.error.message } }, { status: 400 });
    const ownerId = principalOwnerKey(await getCurrentPrincipal(request));
    const session = await getResearchSessionService().updateGraph(ownerId, sessionId, body.data);
    return NextResponse.json(session);
  } catch (error) { return researchError(error); }
}
