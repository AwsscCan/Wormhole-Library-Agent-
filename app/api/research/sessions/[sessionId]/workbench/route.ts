import { privateJson, researchError } from "@/lib/research/api";
import { requireCurrentPrincipal, principalOwnerKey } from "@/lib/research/principal";
import { workbenchUpdateSchema } from "@/lib/workbench/schemas";
import { getWorkbenchService } from "@/lib/workbench/store";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { sessionId } = await params;
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    return privateJson({ workbench: await getWorkbenchService().get(ownerId, sessionId) });
  } catch (error) { return researchError(error); }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const parsed = workbenchUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "Invalid exploration workbench request" } }, 400);
    const { sessionId } = await params;
    const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
    return privateJson({ workbench: await getWorkbenchService().update(ownerId, sessionId, parsed.data) });
  } catch (error) { return researchError(error); }
}
