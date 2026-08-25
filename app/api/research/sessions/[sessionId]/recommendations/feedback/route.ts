import { privateJson, researchError } from "@/lib/research/api";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import { appendExplorationFeedback } from "@/lib/workbench/ports";
import { feedbackSchema } from "@/lib/workbench/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const parsed = feedbackSchema.safeParse(await request.json());
    if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid recommendation feedback" } }, 400);
    const { sessionId } = await params;
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    await getResearchSessionService().get(ownerId, sessionId);
    const result = await appendExplorationFeedback({ ownerId, sessionId, ...parsed.data, occurredAt: new Date().toISOString() });
    return privateJson(result, result.status === "recorded" ? 202 : 503);
  } catch (error) { return researchError(error); }
}
