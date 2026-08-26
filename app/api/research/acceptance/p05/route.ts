import { privateJson } from "@/lib/research/api";
import { principalOwnerKey, requireCurrentPrincipal } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import { p05AcceptanceFixtureEnabled, readP05AcceptanceEvents } from "@/lib/workbench/acceptanceFixture";

export async function GET() {
  if (!p05AcceptanceFixtureEnabled()) return privateJson({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
  return privateJson({ events: readP05AcceptanceEvents() });
}

export async function POST(request: Request) {
  if (!p05AcceptanceFixtureEnabled()) return privateJson({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
  const ownerId = principalOwnerKey(await requireCurrentPrincipal(request));
  const sessions = getResearchSessionService();
  const now = "2026-08-26T00:00:00.000Z";
  const session = await sessions.create(ownerId, { researchQuestion: "How should confirmed evidence guide explainable exploration?",
    writingTopic: "P05 browser acceptance" });
  await sessions.recordSearch(ownerId, session.id, { interactionId: `acceptance-search-${session.id}`, query: "explainable exploration",
    at: now, concepts: [{ id: "session-concept", name: "session concept" }], resources: [{ id: "confirmed-source", title: "Confirmed source",
      concepts: [{ id: "confirmed-concept", name: "confirmed concept" }], sourceLabel: "P05 acceptance fixture", sourceUrl: "https://example.test/confirmed" }] });
  await sessions.addEvidence(ownerId, session.id, "confirmed-source");
  await sessions.recordWormholes(ownerId, session.id, [{ id: "acceptance-wormhole", label: "Contrasting method",
    conceptIds: ["wormhole-concept"] }]);
  return privateJson({ sessionId: session.id, workbenchHref: `/research/${session.id}/workbench`, mapHref: `/research/${session.id}/map` }, 201);
}
