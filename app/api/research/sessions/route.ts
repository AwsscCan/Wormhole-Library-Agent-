import { privateJson, researchError } from "@/lib/research/api";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { createResearchSessionSchema } from "@/lib/research/schemas";
import { getResearchSessionService } from "@/lib/research/sessionStore";

export async function GET(request: Request) {
  try {
    const principal = await requireCurrentPrincipal(request);
    const ownerId = principalOwnerKey(principal);
    return privateJson({ sessions: await getResearchSessionService().list(ownerId) }, 200, principal, request);
  } catch (error) { return researchError(error); }
}

export async function POST(request: Request) {
  try {
    const body = createResearchSessionSchema.safeParse(await request.json());
    if (!body.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid research workspace request" } }, 400);
    const principal = await requireCurrentPrincipal(request);
    const ownerId = principalOwnerKey(principal);
    const session = await getResearchSessionService().create(ownerId, body.data);
    return privateJson(session, 201, principal, request);
  } catch (error) { return researchError(error); }
}
