import { privateJson, researchError } from "@/lib/research/api";
import { ensureAppComposition } from "@/lib/composition";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { recommendForSession } from "@/lib/workbench/runtime";
import { recommendationRequestSchema } from "@/lib/workbench/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    if (process.env.NODE_ENV !== "test") await ensureAppComposition();
    const parsed = recommendationRequestSchema.safeParse(await request.json());
    if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid recommendation request" } }, 400);
    const { sessionId } = await params;
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    return privateJson(await recommendForSession(ownerId, sessionId, parsed.data));
  } catch (error) { return researchError(error); }
}
