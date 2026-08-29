import { getOrchestrator } from "@/lib/agent/orchestrator";
import { ensureAppComposition } from "@/lib/composition";
import { privateJson, researchError } from "@/lib/research/api";
import { principalOwnerKey, requireCurrentPrincipal } from "@/lib/research/principal";

export async function GET(request: Request) {
  try {
    await ensureAppComposition();
    const principal = await requireCurrentPrincipal(request);
    return privateJson(await getOrchestrator().memory(principalOwnerKey(principal)), 200, principal, request);
  } catch (error) { return researchError(error); }
}

/** demo reset：一键重置 demo 用户记忆 */
export async function DELETE(request: Request) {
  try {
    await ensureAppComposition();
    const principal = await requireCurrentPrincipal(request);
    return privateJson(await getOrchestrator().resetMemory(principalOwnerKey(principal)), 200, principal, request);
  } catch (error) { return researchError(error); }
}
