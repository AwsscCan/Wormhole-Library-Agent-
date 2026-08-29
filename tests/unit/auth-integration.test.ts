import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const sqliteModuleName = "node:sqlite";
const { DatabaseSync } = require(sqliteModuleName) as typeof import("node:sqlite");

const temporaryRoot = join(tmpdir(), "wormhole-library-agent-tests");
const databasePath = join(temporaryRoot, `auth-integration-${process.pid}.db`);
const databaseURL = `file:${databasePath.replace(/\\/g, "/")}`;
const databaseFiles = [databasePath, `${databasePath}-journal`, `${databasePath}-shm`, `${databasePath}-wal`];
const testOrigin = "http://auth-integration.test";

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function migrateTemporaryAuthDatabase() {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT,
      "email" TEXT NOT NULL,
      "emailVerified" BOOLEAN NOT NULL DEFAULT false,
      "image" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
    CREATE TABLE "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "expiresAt" DATETIME NOT NULL,
      "token" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId" TEXT NOT NULL,
      CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
    CREATE INDEX "Session_userId_idx" ON "Session"("userId");
    CREATE TABLE "Account" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "issuer" TEXT NOT NULL,
      "accountId" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "accessToken" TEXT,
      "refreshToken" TEXT,
      "idToken" TEXT,
      "accessTokenExpiresAt" DATETIME,
      "refreshTokenExpiresAt" DATETIME,
      "scope" TEXT,
      "password" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX "Account_issuer_accountId_key" ON "Account"("issuer", "accountId");
    CREATE INDEX "Account_userId_idx" ON "Account"("userId");
    CREATE TABLE "Verification" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "identifier" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
    CREATE TABLE "AuthRateLimit" (
      "keyHash" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "windowStartedAt" DATETIME NOT NULL,
      "attempts" INTEGER NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      PRIMARY KEY ("keyHash", "action")
    );
    CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");
  `);
  database.close();
}

describe("Better Auth Prisma integration", () => {
  const originalEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    NODE_ENV: process.env.NODE_ENV,
  };

  beforeAll(async () => {
    await mkdir(dirname(databasePath), { recursive: true });
    process.env.DATABASE_URL = databaseURL;
    process.env.BETTER_AUTH_SECRET = "integration-only-secret-not-used-outside-this-test";
    process.env.BETTER_AUTH_URL = testOrigin;
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    migrateTemporaryAuthDatabase();
    vi.resetModules();
    delete (globalThis as { __prisma?: unknown }).__prisma;
  });

  afterAll(async () => {
    const prisma = (globalThis as { __prisma?: { $disconnect(): Promise<void> } }).__prisma;
    await prisma?.$disconnect();
    delete (globalThis as { __prisma?: unknown }).__prisma;
    await Promise.all(databaseFiles.map((file) => rm(file, { force: true })));
    restoreEnvironment("DATABASE_URL", originalEnvironment.DATABASE_URL);
    restoreEnvironment("BETTER_AUTH_SECRET", originalEnvironment.BETTER_AUTH_SECRET);
    restoreEnvironment("BETTER_AUTH_URL", originalEnvironment.BETTER_AUTH_URL);
    restoreEnvironment("NODE_ENV", originalEnvironment.NODE_ENV);
  });

  it("registers, signs in, and resolves a principal from the real server session", async () => {
    const { POST: authPOST } = await import("@/app/api/auth/[...all]/route");
    const { resolveCurrentPrincipal } = await import("@/lib/auth/principal");
    const email = `member-${crypto.randomUUID()}@example.test`;
    const password = "valid-password-123";

    const signUp = await authPOST(new Request(`${testOrigin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin: testOrigin, "content-type": "application/json" },
      body: JSON.stringify({ name: "Integration Member", email, password }),
    }));
    expect(signUp.status).toBe(200);

    const signIn = await authPOST(new Request(`${testOrigin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: testOrigin, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }));
    expect(signIn.status).toBe(200);
    const signedIn = await signIn.json() as { user: { id: string } };
    const sessionCookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
    expect(sessionCookie).toBeTruthy();

    const principal = await resolveCurrentPrincipal(new Request(`${testOrigin}/api/v3/private`, {
      headers: { cookie: sessionCookie! },
    }));
    expect(principal).toEqual({ id: signedIn.user.id, mode: "member" });
  });
});
