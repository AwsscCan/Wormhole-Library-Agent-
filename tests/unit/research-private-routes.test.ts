import { afterEach, describe, expect, it } from "vitest";
import { POST as migrate } from "@/app/api/research/migrations/route";
import { GET as list, POST as create } from "@/app/api/research/sessions/route";
import { GET as read, PATCH as patch } from "@/app/api/research/sessions/[sessionId]/route";
import { POST as act } from "@/app/api/research/sessions/[sessionId]/actions/route";
import { POST as wormholes } from "@/app/api/research/sessions/[sessionId]/wormholes/route";
import { clearCurrentPrincipalPortForTests } from "@/lib/research/principal";

afterEach(() => clearCurrentPrincipalPortForTests());

describe("all private research routes", () => {
  it("return private, no-store even when the identity port is unavailable", async () => {
    const context = { params: Promise.resolve({ sessionId: "session-x" }) };
    const json = (url: string, body: unknown, method = "POST") => new Request(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const responses = await Promise.all([
      list(new Request("http://local/api/research/sessions")),
      create(json("http://local/api/research/sessions", { researchQuestion: "private" })),
      read(new Request("http://local/api/research/sessions/session-x"), context),
      patch(json("http://local/api/research/sessions/session-x", { expectedVersion: 0, nodeOverrides: {}, hiddenSystemEdgeIds: [], personalEdges: [] }, "PATCH"), context),
      act(json("http://local/actions", { action: "search", nodeId: "topic", topic: "RAG" }), context),
      wormholes(json("http://local/wormholes", { wormholes: [] }), context),
      migrate(json("http://local/migrations", { interactionId: "int-x" })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ error: { code: "PRINCIPAL_UNAVAILABLE", message: "Identity service is temporarily unavailable" } });
    }
  });
});
