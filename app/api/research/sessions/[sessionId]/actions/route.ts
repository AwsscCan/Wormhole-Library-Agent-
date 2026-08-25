import { privateJson, researchError } from "@/lib/research/api";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchWorkspace } from "@/lib/research/runtime";
import { nodeActionSchema } from "@/lib/research/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const body = nodeActionSchema.safeParse(await request.json());
    if (!body.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid research workspace request" } }, 400);
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    return privateJson(await getResearchWorkspace().act(ownerId, sessionId, body.data));
  } catch (error) { return researchError(error); }
}
