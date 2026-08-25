import { getOrchestrator } from "@/lib/agent/orchestrator";
import { queryTopicLibrary } from "./catalogPort";
import { getResearchSessionService } from "./sessionStore";
import { ResearchWorkspace } from "./workspace";

const runtime = globalThis as unknown as { __researchWorkspace?: ResearchWorkspace };

export function getResearchWorkspace() {
  if (!runtime.__researchWorkspace) {
    runtime.__researchWorkspace = new ResearchWorkspace(getResearchSessionService(), {
      search: (input) => getOrchestrator().search(input),
      library: queryTopicLibrary,
    });
  }
  return runtime.__researchWorkspace;
}
