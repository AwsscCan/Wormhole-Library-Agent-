import { privateJson, researchError } from "@/lib/research/api";
import { ensureAppComposition } from "@/lib/composition";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import { ResearchError } from "@/lib/research/types";
import { appendExplorationFeedback } from "@/lib/workbench/ports";
import { feedbackSchema } from "@/lib/workbench/schemas";
import { getWorkbenchService } from "@/lib/workbench/store";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    if (process.env.NODE_ENV !== "test") await ensureAppComposition();
    const parsed = feedbackSchema.safeParse(await request.json());
    if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid recommendation feedback" } }, 400);
    const { sessionId } = await params;
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    await getResearchSessionService().get(ownerId, sessionId);
    const workbench = await getWorkbenchService().get(ownerId, sessionId);
    if (!Object.values(workbench.resourceProjections).some((item) => item.recommendationId === parsed.data.recommendationId)) {
      throw new ResearchError("BAD_REQUEST", "Recommendation feedback target is not part of this session");
    }
    const result = await appendExplorationFeedback({ ownerId, sessionId, ...parsed.data, occurredAt: new Date().toISOString() });
    return privateJson(result, result.status === "recorded" ? 202 : 503);
  } catch (error) { return researchError(error); }
}
