import { afterEach, describe, expect, it } from "vitest";
import { POST as recommend } from "@/app/api/research/sessions/[sessionId]/recommendations/route";
import { POST as feedback } from "@/app/api/research/sessions/[sessionId]/recommendations/feedback/route";
import { bindPackage02SourceCatalogPort, clearPackage02SourceCatalogPortForTests } from "@/lib/research/catalogPort";
import { clearCurrentPrincipalPortForTests, installCurrentPrincipalPortForTests } from "@/lib/research/principal";
import { clearResearchSessionServiceForTests, getResearchSessionService } from "@/lib/research/sessionStore";
import { bindExplorationEventPort, bindPackage04MemoryReadPort, clearWorkbenchPortsForTests } from "@/lib/workbench/ports";
import { clearWorkbenchServiceForTests, getWorkbenchService } from "@/lib/workbench/store";

afterEach(() => {
  clearCurrentPrincipalPortForTests(); clearPackage02SourceCatalogPortForTests(); clearWorkbenchPortsForTests();
  clearWorkbenchServiceForTests(); clearResearchSessionServiceForTests();
});

describe("recommendation API integration", () => {
  it("uses evidence and P04 features, persists a focusable projection, and isolates owners", async () => {
    installCurrentPrincipalPortForTests({ read: async () => ({ id: "alice", mode: "member" }) });
    const sessions = getResearchSessionService();
    const session = await sessions.create("member:alice", { researchQuestion: "calibration evidence" });
    await sessions.recordSearch("member:alice", session.id, { interactionId: `interaction-${session.id}`, query: "calibration", at: session.createdAt,
      concepts: [{ id: "calibration", name: "Calibration" }], resources: [{ id: "confirmed", title: "Confirmed", concepts: [{ id: "calibration", name: "Calibration" }] }] });
    await sessions.addEvidence("member:alice", session.id, "confirmed");
    bindPackage02SourceCatalogPort({ searchTopic: async () => ({ sourceStatus: "live", degraded: false, resources: [{
      id: "candidate", type: "paper", title: "Bayesian calibration", authors: [], language: "en", why: "Evaluates uncertainty",
      availability: "online", difficulty: "research", concepts: [{ id: "calibration", name: "Calibration" }], qualityScore: 0.9,
      sourceUrl: "https://example.test/candidate", provenance: { sourceKind: "openalex", sourceLabel: "OpenAlex", retrievedAt: session.createdAt },
    }] }) });
    bindPackage04MemoryReadPort({ search: async () => [{ id: "snippet", sourceId: "note-7", sessionId: session.id, createdAt: session.createdAt, text: "Bayesian calibration" }], listInferredPreferences: async () => [] });

    const response = await recommend(new Request("http://local/recommend", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surpriseLevel: "low", limit: 1 }) }), { params: Promise.resolve({ sessionId: session.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.recommendations[0]).toMatchObject({ resourceId: "candidate",
      decisionTrace: { sessionEvidenceIds: ["confirmed"], memorySnippetIds: ["snippet"] } });
    expect((await getWorkbenchService().get("member:alice", session.id)).resourceProjections.candidate.title).toBe("Bayesian calibration");
    await expect(getWorkbenchService().get("member:bob", session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns a retryable failure when the event port rejects feedback", async () => {
    installCurrentPrincipalPortForTests({ read: async () => ({ id: "feedback-user", mode: "member" }) });
    const session = await getResearchSessionService().create("member:feedback-user", { researchQuestion: "feedback rejection" });
    bindExplorationEventPort({ append: async () => ({ accepted: false }) });
    const response = await feedback(new Request("http://local/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendationId: "rec-1", feedback: "too_far" }) }), { params: Promise.resolve({ sessionId: session.id }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ accepted: false, status: "rejected" });
  });
});
