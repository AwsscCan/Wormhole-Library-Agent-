import { z } from "zod";
import { privateJson, researchError } from "@/lib/research/api";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";

const activitySchema = z.object({ kind: z.enum(["upload", "writing"]), title: z.string().trim().min(1).max(300), resourceId: z.string().max(300).optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const parsed = activitySchema.safeParse(await request.json());
    if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid knowledge activity" } }, 400);
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    const { sessionId } = await params;
    return privateJson(await getResearchSessionService().recordActivity(ownerId, sessionId, parsed.data));
  } catch (error) { return researchError(error); }
}
