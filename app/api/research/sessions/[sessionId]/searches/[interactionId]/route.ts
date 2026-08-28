import { privateJson, researchError } from "@/lib/research/api";
import { principalOwnerKey, requireCurrentPrincipal } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";

export async function GET(request: Request, { params }: {
  params: Promise<{ sessionId: string; interactionId: string }>;
}) {
  try {
    const { sessionId, interactionId } = await params;
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    return privateJson(await getResearchSessionService().getSearch(ownerId, sessionId, interactionId));
  } catch (error) { return researchError(error); }
}
