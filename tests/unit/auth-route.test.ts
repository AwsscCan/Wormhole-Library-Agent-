import { describe, expect, it, vi } from "vitest";

const fakePrisma = vi.hoisted(() => {
  type RateLimitRow = {
    keyHash: string;
    action: string;
    attempts: number;
    windowStartedAt: Date;
    expiresAt: Date;
  };
  const rows = new Map<string, RateLimitRow>();
  const keyFor = (keyHash: string, action: string) => `${keyHash}:${action}`;
  const authRateLimit = {
    findUnique: async ({ where }: { where: { keyHash_action: Pick<RateLimitRow, "keyHash" | "action"> } }) =>
      rows.get(keyFor(where.keyHash_action.keyHash, where.keyHash_action.action)) ?? null,
    create: async ({ data }: { data: RateLimitRow }) => {
      rows.set(keyFor(data.keyHash, data.action), data);
      return data;
    },
    update: async ({ where, data }: {
      where: { keyHash_action: Pick<RateLimitRow, "keyHash" | "action"> };
      data: Omit<Partial<RateLimitRow>, "attempts"> & { attempts?: number | { increment: number } };
    }) => {
      const key = keyFor(where.keyHash_action.keyHash, where.keyHash_action.action);
      const row = rows.get(key);
      if (!row) throw new Error("missing rate-limit row");
      const attempts = typeof data.attempts === "object"
        ? row.attempts + data.attempts.increment
        : data.attempts ?? row.attempts;
      const next = { ...row, ...data, attempts } as RateLimitRow;
      rows.set(key, next);
      return next;
    },
  };
  return {
    authRateLimit,
    $transaction: async <T>(work: (database: { authRateLimit: typeof authRateLimit }) => Promise<T>) =>
      work({ authRateLimit }),
  };
});

vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => fakePrisma }));

import { POST as authPOST } from "@/app/api/auth/[...all]/route";

describe("Better Auth route", () => {
  it("rejects a cross-origin sign-up before Better Auth receives it", async () => {
    const response = await authPOST(
      new Request("http://test/api/auth/sign-up/email", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns 429 after the configured sign-up threshold", async () => {
    const requestId = `rate-test-${crypto.randomUUID()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await authPOST(
        new Request("http://test/api/auth/sign-up/email", {
          method: "POST",
          headers: {
            origin: "http://test",
            "x-forwarded-for": requestId,
            "content-type": "application/json",
          },
          body: JSON.stringify({ email: `${requestId}@example.test` }),
        }),
      );
      expect(response.status).not.toBe(429);
    }

    const blocked = await authPOST(
      new Request("http://test/api/auth/sign-up/email", {
        method: "POST",
        headers: { origin: "http://test", "x-forwarded-for": requestId },
        body: "{}",
      }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks same-origin authentication responses as private and non-cacheable", async () => {
    const response = await authPOST(
      new Request("http://test/api/auth/not-a-real-endpoint", {
        method: "POST",
        headers: { origin: "http://test" },
      }),
    );

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
