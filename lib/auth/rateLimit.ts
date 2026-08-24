import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";
import { getAuthSecret, getTrustedAuthOrigin } from "@/lib/auth/server";

type RateLimitInput = {
  action: string;
  identifier: string;
  pepper: string;
  limit: number;
  windowMs: number;
};

const AUTH_LIMITS: Record<string, { action: string; limit: number }> = {
  "/api/auth/sign-in/email": { action: "sign-in", limit: 10 },
  "/api/auth/sign-up/email": { action: "sign-up", limit: 5 },
  "/api/auth/request-password-reset": { action: "password-reset", limit: 5 },
};

function hashIdentifier(identifier: string, pepper: string): string {
  return createHash("sha256")
    .update(`${identifier.trim().toLowerCase()}\0${pepper}`)
    .digest("hex");
}

/** Allows read-only auth endpoints and same-origin (or non-browser) writes. */
export function validateAuthOrigin(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === getTrustedAuthOrigin(request);
  } catch {
    return false;
  }
}

async function checkAuthRateLimit(input: RateLimitInput) {
  const keyHash = hashIdentifier(input.identifier, input.pepper);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.windowMs);
  const prisma = getPrisma();

  const row = await prisma.$transaction(async (database) => {
    const existing = await database.authRateLimit.findUnique({
      where: { keyHash_action: { keyHash, action: input.action } },
    });

    if (!existing) {
      return database.authRateLimit.create({
        data: { keyHash, action: input.action, attempts: 1, windowStartedAt: now, expiresAt },
      });
    }

    if (existing.expiresAt <= now) {
      return database.authRateLimit.update({
        where: { keyHash_action: { keyHash, action: input.action } },
        data: { attempts: 1, windowStartedAt: now, expiresAt },
      });
    }

    return database.authRateLimit.update({
      where: { keyHash_action: { keyHash, action: input.action } },
      data: { attempts: { increment: 1 } },
    });
  });

  return { allowed: row.attempts <= input.limit };
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

/** Applies origin and persistent, hashed throttling before Better Auth handles writes. */
export async function guardAuthRequest(request: Request): Promise<Response | null> {
  if (!validateAuthOrigin(request)) {
    return Response.json(
      { error: { code: "INVALID_ORIGIN", message: "请求来源无效" } },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (request.method !== "POST") return null;
  const config = AUTH_LIMITS[new URL(request.url).pathname];
  if (!config) return null;

  const body = await request.clone().json().catch(() => ({})) as { email?: unknown };
  const identifiers = [
    { action: `${config.action}:ip`, identifier: clientIp(request) },
    ...(typeof body.email === "string"
      ? [{ action: `${config.action}:email`, identifier: body.email }]
      : []),
  ];

  for (const item of identifiers) {
    const result = await checkAuthRateLimit({
      ...item,
      pepper: getAuthSecret(),
      limit: config.limit,
      windowMs: 15 * 60_000,
    });
    if (!result.allowed) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后重试" } },
        {
          status: 429,
          headers: { "Cache-Control": "private, no-store", "Retry-After": "900" },
        },
      );
    }
  }
  return null;
}
