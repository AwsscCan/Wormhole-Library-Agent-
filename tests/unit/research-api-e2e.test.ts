import { afterEach, describe, expect, it } from "vitest";
import { POST as createSession } from "@/app/api/research/sessions/route";
import { GET as getSession, PATCH as patchSession } from "@/app/api/research/sessions/[sessionId]/route";
import { clearCurrentPrincipalPortForTests, installCurrentPrincipalPortForTests } from "@/lib/research/principal";

afterEach(() => clearCurrentPrincipalPortForTests());

describe("research API owner/edit/recovery loop", () => {
  it("creates, edits, restores and hides the session from a second principal", async () => {
    let principalId = `alice-${crypto.randomUUID()}`;
    installCurrentPrincipalPortForTests({ read: async () => ({ id: principalId, mode: "member" }) });
    const createdResponse = await createSession(new Request("http://local/api/research/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ researchQuestion: "API closed loop" }),
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

    principalId = `bob-${crypto.randomUUID()}`;
    expect((await getSession(new Request(`http://local/api/research/sessions/${created.id}`), context)).status).toBe(404);
  });

  it("keeps member and guest workspaces isolated through the same package 01 port", async () => {
    let principal = { id: "alice", mode: "member" as const } as { id: string; mode: "member" | "guest" };
    installCurrentPrincipalPortForTests({ read: async () => principal });
    const response = await createSession(new Request("http://local/api/research/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ researchQuestion: "Member only" }),
    }));
    const session = await response.json();
    principal = { id: "guest-device", mode: "guest" };
    const context = { params: Promise.resolve({ sessionId: session.id }) };
    expect((await getSession(new Request(`http://local/api/research/sessions/${session.id}`), context)).status).toBe(404);
  });
});
