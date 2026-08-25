import type { SearchRequest, SearchResponse } from "@/lib/types";
import type { StoredInteraction } from "@/lib/mock/store";
import type { NodeActionInput } from "./schemas";
import type { ResearchSessionService } from "./sessionStore";
import { ResearchError } from "./types";
import type { TopicLibraryResult } from "./types";

type WorkspaceDependencies = {
  search(input: SearchRequest): Promise<SearchResponse>;
  library(input: { query: string; limit?: number }): Promise<TopicLibraryResult>;
};

export class ResearchWorkspace {
  constructor(private readonly sessions: ResearchSessionService, private readonly deps: WorkspaceDependencies) {}

  async act(ownerId: string, sessionId: string, input: NodeActionInput) {
    const session = await this.sessions.get(ownerId, sessionId);
    if (input.action === "search") {
      const query = input.topic === session.researchQuestion ? input.topic : `${input.topic} — ${session.researchQuestion}`;
      const response = await this.deps.search({ userId: ownerId, query, taskType: "research" });
      await this.sessions.recordSearch(ownerId, sessionId, {
        interactionId: response.interactionId,
        query: response.query,
        at: new Date().toISOString(),
        concepts: response.concepts,
        resources: response.resources.map((resource) => ({
          id: resource.id, title: resource.title, concepts: resource.concepts,
          sourceLabel: response.demoCatalog ? "Demo seed catalog" : "Federated catalog",
          sourceUrl: resource.sourceUrl,
        })),
      });
      return { action: "search" as const, sessionId, interactionId: response.interactionId, href: `/explore/${response.interactionId}?sessionId=${encodeURIComponent(sessionId)}`, response };
    }

    if (input.action === "library") {
      try {
        const result = await this.deps.library({ query: input.topic, limit: 12 });
        return { action: "library" as const, sessionId, topic: input.topic, ...result, empty: result.resources.length === 0 };
      } catch (error) {
        throw new ResearchError("SOURCE_FAILURE", error instanceof Error ? error.message : "Catalog source unavailable");
      }
    }

    if (!input.resourceId) throw new ResearchError("BAD_REQUEST", "resourceId is required for add_evidence");
    const updated = await this.sessions.addEvidence(ownerId, sessionId, input.resourceId);
    return { action: "add_evidence" as const, sessionId, evidenceIds: updated.evidenceIds };
  }

  async migrateInteraction(
    ownerId: string,
    interactionId: string,
    resolve: (id: string) => StoredInteraction | null,
  ) {
    const existing = (await this.sessions.list(ownerId)).find((session) => session.interactionIds.includes(interactionId));
    if (existing) return existing;
    const interaction = resolve(interactionId);
    if (!interaction) throw new ResearchError("EXPIRED_INTERACTION", "Legacy interaction expired");
    if (interaction.userId !== ownerId && interaction.userId !== ownerId.replace(/^(member|guest):/, "")) {
      throw new ResearchError("NOT_FOUND", "Legacy interaction not found");
    }
    const session = await this.sessions.create(ownerId, { researchQuestion: interaction.query });
    return this.sessions.recordSearch(ownerId, session.id, {
      interactionId,
      query: interaction.searchResponse.query,
      at: interaction.createdAt,
      concepts: interaction.searchResponse.concepts,
      resources: interaction.searchResponse.resources.map((resource) => ({
        id: resource.id, title: resource.title, concepts: resource.concepts, sourceUrl: resource.sourceUrl,
        sourceLabel: interaction.searchResponse.demoCatalog ? "Demo seed catalog" : "Federated catalog",
      })),
    });
  }
}
