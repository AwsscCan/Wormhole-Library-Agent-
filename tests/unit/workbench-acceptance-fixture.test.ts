import { afterEach, describe, expect, it } from "vitest";
import { GET as readAcceptance, POST as seedAcceptance } from "@/app/api/research/acceptance/p05/route";
import { POST as feedback } from "@/app/api/research/sessions/[sessionId]/recommendations/feedback/route";
import { POST as recommend } from "@/app/api/research/sessions/[sessionId]/recommendations/route";
import { clearResearchSessionServiceForTests } from "@/lib/research/sessionStore";
import { clearP05AcceptanceFixtureForTests, installP05AcceptancePorts } from "@/lib/workbench/acceptanceFixture";
import { clearWorkbenchServiceForTests } from "@/lib/workbench/store";

afterEach(() => {
  clearP05AcceptanceFixtureForTests(); clearWorkbenchServiceForTests(); clearResearchSessionServiceForTests();
  delete process.env.P05_ACCEPTANCE_FIXTURE;
});

describe("development-only P05 browser acceptance fixture", () => {
  it("seeds a full session and exercises quotas, memory, projection and feedback through real routes", async () => {
    process.env.P05_ACCEPTANCE_FIXTURE = "1"; installP05AcceptancePorts();
    const seeded = await seedAcceptance(new Request("http://local/api/research/acceptance/p05", { method: "POST" }));
    expect(seeded.status).toBe(201); const seed = await seeded.json();
    const response = await recommend(new Request("http://local/recommend", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surpriseLevel: "high", limit: 20 }) }), { params: Promise.resolve({ sessionId: seed.sessionId }) });
    expect(response.status).toBe(200); const body = await response.json();
    expect(["direct", "adjacent", "distant"].map((band) => body.recommendations.filter((item: { band: string }) => item.band === band).length))
      .toEqual([8, 7, 5]);
    expect(body.memory).toMatchObject({ status: "available", snippets: [{ sourceId: "acceptance-note" }] });
    expect(Object.keys(body.resourceProjections)).toHaveLength(20);
    const feedbackResponse = await feedback(new Request("http://local/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendationId: body.recommendations[0].id, feedback: "useful" }) }), { params: Promise.resolve({ sessionId: seed.sessionId }) });
    expect(feedbackResponse.status).toBe(202);
    expect(await (await readAcceptance()).json()).toMatchObject({ events: [{ sessionId: seed.sessionId, feedback: "useful" }] });
  });
});
