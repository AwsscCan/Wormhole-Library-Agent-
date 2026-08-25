import { privateJson } from "@/lib/research/api";
import { z } from "zod";
import { researchError } from "@/lib/research/api";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import { ResearchError } from "@/lib/research/types";

const storedSchema = z.object({ wormholes: z.array(z.object({
  id: z.string().min(1), destination: z.string().min(1), pathConceptIds: z.array(z.string().min(1)),
})).max(20) }).strict();
const generateSchema = z.object({
  interactionId: z.string().min(1),
  startConceptIds: z.array(z.string().min(1)).min(1).max(30),
  sliderValue: z.number().int().min(0).max(100),
  maxPaths: z.number().int().min(1).max(10).default(3),
}).strict();
const schema = z.union([storedSchema, generateSchema]);

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const body = schema.safeParse(await request.json());
    if (!body.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid research workspace request" } }, 400);
    const { sessionId } = await params;
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    const sessions = getResearchSessionService();
    let cards;
    if ("interactionId" in body.data) {
      const current = await sessions.get(ownerId, sessionId);
      if (!current.interactionIds.includes(body.data.interactionId)) {
        throw new ResearchError("NOT_FOUND", "Research interaction not found");
      }
      const generated = await getOrchestrator().wormholes({
        userId: ownerId, interactionId: body.data.interactionId, startConceptIds: body.data.startConceptIds,
        sliderValue: body.data.sliderValue, maxPaths: body.data.maxPaths,
      });
      cards = generated.wormholes;
    } else {
      cards = body.data.wormholes;
    }
    const session = await sessions.recordWormholes(ownerId, sessionId, cards.map((wormhole) => ({
      id: wormhole.id, label: wormhole.destination, conceptIds: wormhole.pathConceptIds,
    })));
    return privateJson({ sessionId, wormholes: cards, savedWormholes: session.wormholes });
  } catch (error) { return researchError(error); }
}
