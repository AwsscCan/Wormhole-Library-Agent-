import { getOrchestrator } from "@/lib/agent/orchestrator";
import { parseBody } from "@/lib/validation/api";
import { wormholesRequestSchema } from "@/lib/validation/schemas";
import { privateJson, researchError } from "@/lib/research/api";
import { principalOwnerKey, requireCurrentPrincipal } from "@/lib/research/principal";

export async function POST(request: Request) {
  const parsed = await parseBody(request, wormholesRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const principal = await requireCurrentPrincipal(request);
    const result = await getOrchestrator().wormholes({ ...parsed.data, userId: principalOwnerKey(principal) });
    return privateJson(result, 200, principal, request);
  } catch (error) { return researchError(error); }
}
