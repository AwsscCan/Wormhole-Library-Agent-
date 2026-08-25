import { privateJson } from "@/lib/research/api";
import { z } from "zod";
import { getOrchestrator } from "@/lib/agent/orchestrator";
import { researchError } from "@/lib/research/api";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchWorkspace } from "@/lib/research/runtime";

const schema = z.object({ interactionId: z.string().min(1) }).strict();

export async function POST(request: Request) {
  try {
    const body = schema.safeParse(await request.json());
    if (!body.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid research workspace request" } }, 400);
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    const session = await getResearchWorkspace().migrateInteraction(ownerId, body.data.interactionId, (id) => getOrchestrator().getInteraction(id));
    return privateJson({ sessionId: session.id, session });
  } catch (error) { return researchError(error); }
}
