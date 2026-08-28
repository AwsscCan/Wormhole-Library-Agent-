import { afterEach, describe, expect, it } from "vitest";
import { POST as createSession } from "@/app/api/research/sessions/route";
import { GET as readLegacySearch } from "@/app/api/search/route";
import { researchError } from "@/lib/research/api";
import { getStore } from "@/lib/mock/store";
import {
  clearCurrentPrincipalPortForTests,
  installCurrentPrincipalPortForTests,
  requireCurrentPrincipal,
} from "@/lib/research/principal";

afterEach(() => clearCurrentPrincipalPortForTests());

describe("research API security boundary", () => {
  it("has no production fallback identity when package 01 is unavailable", async () => {
    await expect(requireCurrentPrincipal(new Request("http://local"))).rejects.toMatchObject({
      code: "PRINCIPAL_UNAVAILABLE",
    });
  });

  it("passes the real request cookie to the injected package 01 principal port", async () => {
    installCurrentPrincipalPortForTests({
      read: async (request) => request.headers.get("cookie") === "member_session=alice"
        ? { id: "alice", mode: "member" as const }
        : null,
    });
    await expect(requireCurrentPrincipal(new Request("http://local", {
      headers: { cookie: "member_session=alice" },
    }))).resolves.toEqual({ id: "alice", mode: "member" });
  });

  it("marks private responses no-store and rejects client identity fields", async () => {
    installCurrentPrincipalPortForTests({ read: async () => ({ id: "alice", mode: "member" }) });
    const response = await createSession(new Request("http://local/api/research/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ researchQuestion: "Private", ownerId: "bob" }),
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("only returns a legacy interaction to its current owner", async () => {
    const interactionId = `private-search-${crypto.randomUUID()}`;
    getStore().interactions.set(interactionId, {
      id: interactionId,
      userId: "member:alice",
      query: "private research",
      sliderValue: 50,
      conceptIds: [],
      createdAt: "2026-08-24T12:00:00.000Z",
      searchResponse: {
        interactionId,
        query: "private research",
        concepts: [],
        resources: [],
        readingPath: [],
        memoryUsed: [],
      },
    });
    let principalId = "alice";
    installCurrentPrincipalPortForTests({ read: async () => ({ id: principalId, mode: "member" }) });

    const owned = await readLegacySearch(new Request(`http://local/api/search?interactionId=${interactionId}`));
    expect(owned.status).toBe(200);
    expect(owned.headers.get("cache-control")).toBe("private, no-store");
    expect(await owned.json()).toMatchObject({ interactionId, query: "private research" });

    principalId = "bob";
    const foreign = await readLegacySearch(new Request(`http://local/api/search?interactionId=${interactionId}`));
    expect(foreign.status).toBe(404);
    expect(foreign.headers.get("cache-control")).toBe("private, no-store");
    getStore().interactions.delete(interactionId);
  });

  it("does not expose unknown internal error details", async () => {
    const response = researchError(new Error("E:/secret/path/database.sqlite failed"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unexpected research workspace error" },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
