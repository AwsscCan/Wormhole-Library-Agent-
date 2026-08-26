import { bindPackage02SourceCatalogPort, clearPackage02SourceCatalogPortForTests } from "@/lib/research/catalogPort";
import { bindPackage01CurrentPrincipalPort, clearCurrentPrincipalPortForTests } from "@/lib/research/principal";
import type { SourceTransparentResource } from "@/lib/research/types";
import { bindExplorationEventPort, bindPackage04MemoryReadPort, clearWorkbenchPortsForTests } from "./ports";
import type { ExplorationFeedbackEvent } from "./types";

const fixture = globalThis as unknown as { __p05AcceptanceInstalled?: boolean; __p05AcceptanceEvents?: ExplorationFeedbackEvent[] };
export const p05AcceptanceFixtureEnabled = () => process.env.NODE_ENV !== "production" && process.env.P05_ACCEPTANCE_FIXTURE === "1";

function resources(): SourceTransparentResource[] {
  const now = "2026-08-26T00:00:00.000Z";
  const build = (prefix: string, conceptId: string, count: number, why: string) => Array.from({ length: count }, (_, index): SourceTransparentResource => ({
    id: `${prefix}-${index + 1}`, type: "paper", title: `${prefix} acceptance resource ${index + 1}`, authors: ["Acceptance Fixture"],
    language: "en", why, availability: "online", difficulty: index % 3 === 0 ? "research" : "graduate",
    concepts: [{ id: conceptId, name: conceptId.replaceAll("-", " ") }], qualityScore: 0.92 - index * 0.005,
    sourceUrl: `https://example.test/${prefix}/${index + 1}`,
    provenance: { sourceKind: "openalex", sourceLabel: "P05 acceptance fixture", retrievedAt: now, externalId: `fixture:${prefix}:${index + 1}` },
  }));
  return [
    ...build("direct", "confirmed-concept", 24, "Compares the confirmed evidence method"),
    ...build("adjacent", "session-concept", 15, "Extends the active session concept"),
    ...build("distant", "wormhole-concept", 10, "Offers a contrasting method through the saved wormhole"),
  ];
}

export function installP05AcceptancePorts() {
  if (!p05AcceptanceFixtureEnabled() || fixture.__p05AcceptanceInstalled) return;
  fixture.__p05AcceptanceInstalled = true; fixture.__p05AcceptanceEvents = [];
  bindPackage01CurrentPrincipalPort({ read: async () => ({ id: "p05-acceptance", mode: "guest" }) });
  bindPackage02SourceCatalogPort({ searchTopic: async () => ({ resources: resources(), sourceStatus: "live", degraded: false }) });
  bindPackage04MemoryReadPort({
    search: async ({ sessionId }) => [{ id: "acceptance-memory", sourceId: "acceptance-note", sessionId,
      createdAt: "2026-08-25T00:00:00.000Z", text: "confirmed evidence method" }],
    listInferredPreferences: async () => [{ id: "acceptance-preference", key: "source", value: "evidence", confidence: 0.9, evidenceCount: 3 }],
  });
  bindExplorationEventPort({ append: async (event) => { fixture.__p05AcceptanceEvents!.push(event); return { accepted: true }; } });
}

export function readP05AcceptanceEvents() { return [...(fixture.__p05AcceptanceEvents ?? [])]; }

export function clearP05AcceptanceFixtureForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("Acceptance fixture reset is test-only");
  delete fixture.__p05AcceptanceInstalled; delete fixture.__p05AcceptanceEvents;
  clearCurrentPrincipalPortForTests(); clearPackage02SourceCatalogPortForTests(); clearWorkbenchPortsForTests();
}
