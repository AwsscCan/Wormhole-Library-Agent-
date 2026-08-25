import { afterEach, describe, expect, it } from "vitest";
import { POST as createSession } from "@/app/api/research/sessions/route";
import { researchError } from "@/lib/research/api";
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

  it("does not expose unknown internal error details", async () => {
    const response = researchError(new Error("E:/secret/path/database.sqlite failed"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unexpected research workspace error" },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
