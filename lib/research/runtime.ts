import { getOrchestrator } from "@/lib/agent/orchestrator";
import { integratePackages } from "@/lib/composition";
import { queryTopicLibrary } from "./catalogPort";
import { getResearchSessionService } from "./sessionStore";
import { ResearchWorkspace } from "./workspace";

const runtime = globalThis as unknown as { __researchWorkspace?: ResearchWorkspace };

export function getResearchWorkspace() {
  if (!runtime.__researchWorkspace) {
    integratePackages();
    runtime.__researchWorkspace = new ResearchWorkspace(getResearchSessionService(), {
      search: (input) => getOrchestrator().search(input),
      library: queryTopicLibrary,
    });
  }
  return runtime.__researchWorkspace;
}
