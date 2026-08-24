import { describe, expect, it } from "vitest";
import {
  BetterAuthConfigurationError,
  buildAuthOptions,
  getAuth,
  type AuthEnvironment,
} from "@/lib/auth/server";
import { validateAuthOrigin } from "@/lib/auth/rateLimit";

function testAuthEnvironment(): AuthEnvironment {
  return {
    baseURL: "http://test",
    secret: "test-secret-that-is-long-enough-for-better-auth",
    isProduction: false,
  };
}

describe("Better Auth server configuration", () => {
  it("allows password sign-up without requiring a verified email", () => {
    const options = buildAuthOptions(testAuthEnvironment());

    expect(options.emailAndPassword?.requireEmailVerification).toBe(false);
    expect(options.emailVerification).toBeUndefined();
  });

  it("enforces the supported password length bounds", () => {
    const options = buildAuthOptions(testAuthEnvironment());

    expect(options.emailAndPassword?.minPasswordLength).toBe(10);
    expect(options.emailAndPassword?.maxPasswordLength).toBe(128);
    expect(options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });

  it("requires a canonical Better Auth URL in production", () => {
    const environment = process.env as Record<string, string | undefined>;
    const previousNodeEnv = environment.NODE_ENV;
    const previousSecret = environment.BETTER_AUTH_SECRET;
    const previousURL = environment.BETTER_AUTH_URL;
    environment.NODE_ENV = "production";
    environment.BETTER_AUTH_SECRET = "production-test-secret-that-is-long-enough";
    delete environment.BETTER_AUTH_URL;

    try {
      expect(() => getAuth(new Request("https://untrusted.example/api/auth/get-session")))
        .toThrow(BetterAuthConfigurationError);
    } finally {
      environment.NODE_ENV = previousNodeEnv;
      if (previousSecret === undefined) delete environment.BETTER_AUTH_SECRET;
      else environment.BETTER_AUTH_SECRET = previousSecret;
      if (previousURL === undefined) delete environment.BETTER_AUTH_URL;
      else environment.BETTER_AUTH_URL = previousURL;
    }
  });

  it("uses the configured production origin instead of an incoming host", () => {
    const environment = process.env as Record<string, string | undefined>;
    const previousNodeEnv = environment.NODE_ENV;
    const previousURL = environment.BETTER_AUTH_URL;
    environment.NODE_ENV = "production";
    environment.BETTER_AUTH_URL = "https://library.example";

    try {
      expect(validateAuthOrigin(new Request("https://untrusted.example/api/auth/sign-up/email", {
        method: "POST",
        headers: { origin: "https://untrusted.example" },
      }))).toBe(false);
    } finally {
      environment.NODE_ENV = previousNodeEnv;
      if (previousURL === undefined) delete environment.BETTER_AUTH_URL;
      else environment.BETTER_AUTH_URL = previousURL;
    }
  });
});
