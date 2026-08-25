import { privateJson } from "@/lib/research/api";
import { z } from "zod";
import { researchError } from "@/lib/research/api";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";

const schema = z.object({ wormholes: z.array(z.object({
  id: z.string().min(1), destination: z.string().min(1), pathConceptIds: z.array(z.string().min(1)),
})).max(20) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const body = schema.safeParse(await request.json());
    if (!body.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid research workspace request" } }, 400);
    const { sessionId } = await params;
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    const session = await getResearchSessionService().recordWormholes(ownerId, sessionId, body.data.wormholes.map((wormhole) => ({ id: wormhole.id, label: wormhole.destination, conceptIds: wormhole.pathConceptIds })));
    return privateJson({ sessionId, wormholes: session.wormholes });
  } catch (error) { return researchError(error); }
}
