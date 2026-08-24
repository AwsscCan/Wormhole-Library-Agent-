import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth";
import { getPrisma } from "@/lib/db/prisma";
import type { CurrentPrincipal } from "@/lib/auth/principal";

const developmentAuthSecret = "wormhole-library-development-auth-secret";

export type AuthEnvironment = {
  baseURL: string;
  secret: string;
  isProduction: boolean;
};

export class BetterAuthConfigurationError extends Error {
  constructor() {
    super("Authentication is not configured");
    this.name = "BetterAuthConfigurationError";
  }
}

export function getAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new BetterAuthConfigurationError();
  return developmentAuthSecret;
}

function environmentFor(request: Request): AuthEnvironment {
  const configuredBaseURL = process.env.BETTER_AUTH_URL;
  const baseURL = new URL(configuredBaseURL ?? request.url).origin;
  return {
    baseURL,
    secret: getAuthSecret(),
    isProduction: process.env.NODE_ENV === "production",
  };
}

/** Builds the password-only Better Auth configuration used by this application. */
export function buildAuthOptions(input: AuthEnvironment): BetterAuthOptions {
  return {
    baseURL: input.baseURL,
    secret: input.secret,
    database: prismaAdapter(getPrisma(), { provider: "sqlite" }),
    trustedOrigins: [input.baseURL],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
  };
}

/** Creates an auth server bound to the request's trusted application origin. */
export function getAuth(request: Request): Auth {
  return betterAuth(buildAuthOptions(environmentFor(request)));
}

/** Resolves only an authoritative, server-stored Better Auth session. */
export async function getMemberPrincipal(request: Request): Promise<CurrentPrincipal | null> {
  const session = await getAuth(request).api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session?.session || !session.user?.id) return null;
  return { id: session.user.id, mode: "member" };
}
