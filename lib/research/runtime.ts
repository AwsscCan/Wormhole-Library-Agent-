import { getOrchestrator } from "@/lib/agent/orchestrator";
import { catalogAdapter } from "@/lib/catalog/adapter";
import { getResearchSessionService } from "./sessionStore";
import { ResearchWorkspace } from "./workspace";

const runtime = globalThis as unknown as { __researchWorkspace?: ResearchWorkspace };

export function getResearchWorkspace() {
  if (!runtime.__researchWorkspace) {
    runtime.__researchWorkspace = new ResearchWorkspace(getResearchSessionService(), {
      search: (input) => getOrchestrator().search(input),
      library: ({ query, limit }) => catalogAdapter.searchCatalog({ query, limit }),
    });
  }
  return runtime.__researchWorkspace;
}
