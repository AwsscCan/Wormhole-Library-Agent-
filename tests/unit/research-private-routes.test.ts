import { afterEach, describe, expect, it } from "vitest";
import { POST as migrate } from "@/app/api/research/migrations/route";
import { GET as list, POST as create } from "@/app/api/research/sessions/route";
import { GET as read, PATCH as patch } from "@/app/api/research/sessions/[sessionId]/route";
import { POST as act } from "@/app/api/research/sessions/[sessionId]/actions/route";
import { POST as wormholes } from "@/app/api/research/sessions/[sessionId]/wormholes/route";
import { GET as savedSearch } from "@/app/api/research/sessions/[sessionId]/searches/[interactionId]/route";
import { clearCurrentPrincipalPortForTests } from "@/lib/research/principal";
import { clearResearchSessionServiceForTests } from "@/lib/research/sessionStore";
import { bindPackage01ServerPrincipal } from "@/lib/integration/package01Principal";

afterEach(() => {
  clearCurrentPrincipalPortForTests();
  clearResearchSessionServiceForTests();
});

describe("all private research routes", () => {
  it("persists a new guest principal on the first session response", async () => {
    bindPackage01ServerPrincipal();
    const created = await create(new Request("http://local/api/research/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ researchQuestion: "race-free guest workspace" }),
    }));
    expect(created.status).toBe(201);
    const cookie = created.headers.get("set-cookie");
    expect(cookie).toContain("wl_guest=");
    const session = await created.json();

    const action = await act(new Request(`http://local/api/research/sessions/${session.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookie!.split(";", 1)[0] },
      body: JSON.stringify({ action: "search", nodeId: "topic", topic: "AI Agent" }),
    }), { params: Promise.resolve({ sessionId: session.id }) });
    expect(action.status).toBe(200);
  });

  it("keeps non-entry private routes no-store when the identity port is unavailable", async () => {
    const context = { params: Promise.resolve({ sessionId: "session-x" }) };
    const searchContext = { params: Promise.resolve({ sessionId: "session-x", interactionId: "interaction-x" }) };
    const json = (url: string, body: unknown, method = "POST") => new Request(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const responses = await Promise.all([
      read(new Request("http://local/api/research/sessions/session-x"), context),
      patch(json("http://local/api/research/sessions/session-x", { expectedVersion: 0, nodeOverrides: {}, hiddenSystemEdgeIds: [], personalEdges: [] }, "PATCH"), context),
      act(json("http://local/actions", { action: "search", nodeId: "topic", topic: "RAG" }), context),
      wormholes(json("http://local/wormholes", { wormholes: [] }), context),
      savedSearch(new Request("http://local/saved-search"), searchContext),
      migrate(json("http://local/migrations", { interactionId: "int-x" })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ error: { code: "PRINCIPAL_UNAVAILABLE", message: "Identity service is temporarily unavailable" } });
    }
  });
});
