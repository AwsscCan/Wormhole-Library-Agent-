import { afterAll, describe, expect, it } from "vitest";
import { POST as createSession } from "@/app/api/research/sessions/route";
import { GET as getSession, PATCH as patchSession } from "@/app/api/research/sessions/[sessionId]/route";

const oldId = process.env.RESEARCH_PRINCIPAL_ID;
const oldMode = process.env.RESEARCH_PRINCIPAL_MODE;

afterAll(() => {
  if (oldId === undefined) delete process.env.RESEARCH_PRINCIPAL_ID; else process.env.RESEARCH_PRINCIPAL_ID = oldId;
  if (oldMode === undefined) delete process.env.RESEARCH_PRINCIPAL_MODE; else process.env.RESEARCH_PRINCIPAL_MODE = oldMode;
});

describe("research API owner/edit/recovery loop", () => {
  it("creates, edits, restores and hides the session from a second principal", async () => {
    process.env.RESEARCH_PRINCIPAL_MODE = "member";
    process.env.RESEARCH_PRINCIPAL_ID = `alice-${crypto.randomUUID()}`;
    const createdResponse = await createSession(new Request("http://local/api/research/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ researchQuestion: "API closed loop", ownerId: "attacker" }),
    }));
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.ownerId).toContain("alice-");

    const context = { params: Promise.resolve({ sessionId: created.id }) };
    const patchedResponse = await patchSession(new Request(`http://local/api/research/sessions/${created.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        expectedVersion: 0,
        nodeOverrides: { topic: { position: { x: 9, y: 12 }, pinned: true, hidden: false, note: "persist me", updatedAt: "2026-08-24T12:00:00.000Z" } },
        hiddenSystemEdgeIds: [], personalEdges: [],
      }),
    }), context);
    expect(patchedResponse.status).toBe(200);

    const restored = await (await getSession(new Request(`http://local/api/research/sessions/${created.id}`), context)).json();
    expect(restored.session.personalGraph.nodeOverrides.topic.note).toBe("persist me");
    expect(restored.graph.nodes.find((node: { id: string }) => node.id === "topic").pinned).toBe(true);

    process.env.RESEARCH_PRINCIPAL_ID = `bob-${crypto.randomUUID()}`;
    expect((await getSession(new Request(`http://local/api/research/sessions/${created.id}`), context)).status).toBe(404);
  });
});
