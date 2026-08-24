import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type CurrentPrincipal = {
  id: string;
  mode: "member" | "guest";
};

type MemberSession = { userId: string };

const GUEST_COOKIE = "wl_guest";
const guestIdPattern = /^[A-Za-z0-9_-]{32,128}$/;

export class AuthConfigurationError extends Error {
  constructor() {
    super("Authentication is not configured");
    this.name = "AuthConfigurationError";
  }
}

/**
 * Member sessions are intentionally not inferred from request data. The member
 * session reader will be connected to the application's identity provider when
 * that provider is introduced.
 */
async function readMemberSession(_cookieHeader: string): Promise<MemberSession | null> {
  return null;
}

function guestSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") throw new AuthConfigurationError();

  // Local and test environments have no identity provider configured yet.
  return "wormhole-library-development-guest-secret";
}

function signatureFor(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

function encodeGuest(id: string, secret: string): string {
  return `${id}.${signatureFor(id, secret)}`;
}

function decodeGuest(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;

  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!guestIdPattern.test(id) || !signature) return null;

  const expected = signatureFor(id, secret);
  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length) return null;
  return timingSafeEqual(supplied, expectedBuffer) ? id : null;
}

function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

function createGuestId(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Resolves identity exclusively from authenticated server-side session data or
 * a signed guest cookie. Request query strings and bodies are never consulted.
 */
export async function resolveCurrentPrincipal(request: Request): Promise<CurrentPrincipal> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const member = await readMemberSession(cookieHeader);
  if (member) return { id: member.userId, mode: "member" };

  const secret = guestSecret();
  const guestId = decodeGuest(readCookie(cookieHeader, GUEST_COOKIE), secret) ?? createGuestId();
  return { id: guestId, mode: "guest" };
}

/** Test-only signing helper; it returns a cookie value, never the secret. */
export function encodeGuestForTest(id: string): string {
  return encodeGuest(id, guestSecret());
}

export function guestCookieHeader(principal: CurrentPrincipal): string | null {
  if (principal.mode !== "guest") return null;
  return `${GUEST_COOKIE}=${encodeGuest(principal.id, guestSecret())}; HttpOnly; SameSite=Lax; Path=/`;
}
