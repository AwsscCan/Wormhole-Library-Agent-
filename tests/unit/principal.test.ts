import { describe, expect, it } from "vitest";
import { encodeGuestForTest, resolveCurrentPrincipal } from "@/lib/auth/principal";
import { requirePrincipal } from "@/lib/auth/requirePrincipal";

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

  it("rejects a tampered guest cookie instead of accepting its claimed identity", async () => {
    const principal = await resolveCurrentPrincipal(
      new Request("http://test/api/v3/notes", {
        headers: { cookie: "wl_guest=forged-user.invalid-signature" },
      }),
    );

    expect(principal).toMatchObject({ mode: "guest" });
    expect(principal.id).not.toBe("forged-user");
  });

  it("provides a guest principal to a guest-capable route", async () => {
    const result = await requirePrincipal(new Request("http://test/api/v3/notes"));

    expect("principal" in result).toBe(true);
    if ("principal" in result) expect(result.principal.mode).toBe("guest");
  });
});
