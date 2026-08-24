import { describe, expect, it } from "vitest";
import { encodeGuestForTest, guestCookieHeader, resolveCurrentPrincipal } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";
import { GET as principalGET } from "@/app/api/v3/principal/route";

describe("resolveCurrentPrincipal", () => {
  it("ignores a forged body userId and keeps the server guest identity stable", async () => {
    const first = await resolveCurrentPrincipal(
      new Request("http://test/api/v3/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "forged-user" }),
      }),
    );
    expect(first.mode).toBe("guest");
    expect(first.id).not.toBe("forged-user");

    const second = await resolveCurrentPrincipal(
      new Request("http://test/api/v3/notes", {
        headers: { cookie: `wl_guest=${encodeGuestForTest(first.id)}` },
      }),
    );
    expect(second).toEqual(first);
  });

  it("rejects a format-valid guest cookie with a tampered signature", async () => {
    const id = "a".repeat(43);
    const signed = encodeGuestForTest(id);
    const tampered = `${signed.slice(0, -1)}${signed.endsWith("A") ? "B" : "A"}`;
    const principal = await resolveCurrentPrincipal(
      new Request("http://test/api/v3/notes", {
        headers: { cookie: `wl_guest=${tampered}` },
      }),
    );

    expect(principal).toMatchObject({ mode: "guest" });
    expect(principal.id).not.toBe(id);
  });

  it("provides a guest principal to a guest-capable route", async () => {
    const result = await requirePrincipal(new Request("http://test/api/v3/notes"));

    expect("principal" in result).toBe(true);
    if ("principal" in result) expect(result.principal.mode).toBe("guest");
  });

  it("returns 401 only when a route declares that membership is required", async () => {
    const result = await requirePrincipal(new Request("http://test/api/v3/private"), {
      memberOnly: true,
    });

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({
        error: { code: "UNAUTHORIZED", message: "Authentication is required" },
      });
    }
  });

  it("returns a non-secret 500 response when production lacks AUTH_SECRET", async () => {
    const environment = process.env as Record<string, string | undefined>;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.AUTH_SECRET;
    environment["NODE_ENV"] = "production";
    delete environment["AUTH_SECRET"];

    try {
      const result = await requirePrincipal(new Request("http://test/api/v3/notes"));
      expect("response" in result).toBe(true);
      if ("response" in result) {
        expect(result.response.status).toBe(500);
        await expect(result.response.json()).resolves.toEqual({
          error: { code: "INTERNAL_ERROR", message: "Authentication is not configured" },
        });
      }
    } finally {
      environment["NODE_ENV"] = previousNodeEnv;
      if (previousSecret === undefined) delete environment["AUTH_SECRET"];
      else environment["AUTH_SECRET"] = previousSecret;
    }
  });

  it("emits a signed guest cookie and preserves the same identity when replayed", async () => {
    const firstResponse = await principalGET(
      new Request("http://test/api/v3/principal?userId=forged-user"),
    );
    const first = await firstResponse.json();
    const setCookie = firstResponse.headers.get("set-cookie");

    expect(first.principal).toMatchObject({ mode: "guest" });
    expect(first.principal.id).not.toBe("forged-user");
    expect(setCookie).toMatch(/^wl_guest=[A-Za-z0-9_=-]+\.[A-Za-z0-9_-]+; HttpOnly; SameSite=Lax; Path=\/$/);
    expect(firstResponse.headers.get("cache-control")).toBe("private, no-store");

    const replayResponse = await principalGET(
      new Request("http://test/api/v3/principal", {
        headers: { cookie: setCookie!.split(";", 1)[0] },
      }),
    );
    const replay = await replayResponse.json();
    expect(replay.principal).toEqual(first.principal);
  });

  it("marks an HTTPS guest cookie Secure", () => {
    const cookie = guestCookieHeader(
      { id: "s".repeat(43), mode: "guest" },
      new Request("https://library.example/api/v3/principal"),
    );
    expect(cookie).toContain("; Secure");
  });

  it("marks principal configuration failures private and non-cacheable", async () => {
    const environment = process.env as Record<string, string | undefined>;
    const previousNodeEnv = environment.NODE_ENV;
    const previousAuthSecret = environment.AUTH_SECRET;
    const previousBetterSecret = environment.BETTER_AUTH_SECRET;
    const previousBetterUrl = environment.BETTER_AUTH_URL;
    environment.NODE_ENV = "production";
    delete environment.AUTH_SECRET;
    environment.BETTER_AUTH_SECRET = "production-test-secret-that-is-long-enough";
    environment.BETTER_AUTH_URL = "https://library.example";
    try {
      const response = await principalGET(new Request("https://library.example/api/v3/principal"));
      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    } finally {
      environment.NODE_ENV = previousNodeEnv;
      if (previousAuthSecret === undefined) delete environment.AUTH_SECRET;
      else environment.AUTH_SECRET = previousAuthSecret;
      if (previousBetterSecret === undefined) delete environment.BETTER_AUTH_SECRET;
      else environment.BETTER_AUTH_SECRET = previousBetterSecret;
      if (previousBetterUrl === undefined) delete environment.BETTER_AUTH_URL;
      else environment.BETTER_AUTH_URL = previousBetterUrl;
    }
  });
});
