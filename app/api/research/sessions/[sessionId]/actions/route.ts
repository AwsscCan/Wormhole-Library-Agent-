import { privateJson, researchError } from "@/lib/research/api";
import { ensureAppComposition } from "@/lib/composition";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { getResearchWorkspace } from "@/lib/research/runtime";
import { nodeActionSchema } from "@/lib/research/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    if (process.env.NODE_ENV !== "test") await ensureAppComposition();
    const { sessionId } = await params;
    const body = nodeActionSchema.safeParse(await request.json());
    if (!body.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid research workspace request" } }, 400);
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    const languageCookie = request.headers.get("cookie")?.match(/(?:^|;\s*)wl_language=([^;]+)/)?.[1];
    const language = languageCookie === "zh_first" ? "zh" : languageCookie === "en_first" ? "en" : "any";
    return privateJson(await getResearchWorkspace().act(ownerId, sessionId, { ...body.data, language }));
  } catch (error) { return researchError(error); }
}
