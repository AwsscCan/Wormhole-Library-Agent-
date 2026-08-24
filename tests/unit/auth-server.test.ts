import { describe, expect, it } from "vitest";
import { buildAuthOptions, type AuthEnvironment } from "@/lib/auth/server";

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
});
