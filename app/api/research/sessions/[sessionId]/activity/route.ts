import { z } from "zod";
import { ensureAppComposition } from "@/lib/composition";
import { privateJson, researchError } from "@/lib/research/api";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import { recordLearningEvent } from "@/lib/research/memory";

const activitySchema = z.object({ kind: z.enum(["upload", "writing"]), title: z.string().trim().min(1).max(300), resourceId: z.string().max(300).optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    if (process.env.NODE_ENV !== "test") await ensureAppComposition();
    const parsed = activitySchema.safeParse(await request.json());
    if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid knowledge activity" } }, 400);
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    const { sessionId } = await params;
    const session = await getResearchSessionService().recordActivity(ownerId, sessionId, parsed.data);
    const conceptId = parsed.data.title.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).find((word) => word.length > 1);
    try {
      await recordLearningEvent({ ownerId, sessionId, kind: "note", conceptId, resourceId: parsed.data.resourceId, text: parsed.data.title });
    } catch (error) {
      console.error("[research] Unable to index knowledge activity in private memory.", error);
    }
    return privateJson(session);
  } catch (error) { return researchError(error); }
}
