import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Validate every generated path before best-effort cleanup. A managed sandbox
 * may refuse deletion after all migration assertions pass; that must not turn
 * a valid deployment result into a false negative or bypass its safety shim.
 */
function deleteFile(filePath: string): void {
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(filePath);
  const parent = path.dirname(resolved);
  const filename = path.basename(resolved);
  const allowed = (parent === root && filename.startsWith("shadow-") && filename.endsWith(".db"))
    || (parent === path.join(root, "prisma") && /^(deploy|upgrade)-.+\.db$/.test(filename));
  if (!allowed) throw new Error(`Refusing to clean unexpected migration test path: ${resolved}`);
  try { rmSync(resolved, { force: true }); } catch { /* sandbox cleanup is best-effort */ }
}

describe("standard Prisma deployment chain", () => {
  it("contains a provider lock and deploys all migrations into an empty SQLite database", () => {
    expect(existsSync(path.join(process.cwd(), "prisma/migrations/migration_lock.toml"))).toBe(true);
    expect(readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8")).toContain("model ExplorationWorkbench");
    const filename = `deploy-${process.pid}-${Date.now()}.db`;
    const shadowFilename = `shadow-${process.pid}-${Date.now()}.db`;
    const databasePath = path.join(process.cwd(), "prisma", filename);
    const shadowPath = path.join(process.cwd(), shadowFilename);
    const databaseUrl = `file:./${filename}`;
    const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
    try {
      // The managed Windows sandbox cannot let Prisma atomically create a new
      // SQLite file, so pre-create a genuinely empty database file. Deploy still
      // owns every table and the complete migration history.
      writeFileSync(databasePath, "");
      const output = execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
        cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8",
      });
      expect(output).toContain("All migrations have been successfully applied");
      writeFileSync(shadowPath, "");
      const diff = execFileSync(process.execPath, [prismaCli, "migrate", "diff", "--from-migrations", "prisma/migrations",
        "--to-schema-datamodel", "prisma/schema.prisma", "--shadow-database-url", `file:./${shadowFilename}`, "--exit-code"], {
        cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8",
      });
      expect(diff).toContain("No difference detected");
    } finally { deleteFile(databasePath); deleteFile(shadowPath); }
  }, 30_000);

  it("baselines an existing schema and preserves identity rows while deploying 03/05", async () => {
    const filename = `upgrade-${process.pid}-${Date.now()}.db`;
    const databasePath = path.join(process.cwd(), "prisma", filename);
    const absoluteUrl = `file:${databasePath.replace(/\\/g, "/")}`;
    writeFileSync(databasePath, "");
    const first = new PrismaClient({ datasources: { db: { url: absoluteUrl } } });
    try {
      const baseline = readFileSync(path.join(process.cwd(), "prisma/migrations/202608200000_initial_schema/migration.sql"), "utf8");
      for (const statement of baseline.split(";").map((value) => value.trim()).filter(Boolean)) await first.$executeRawUnsafe(statement);
      await first.$executeRawUnsafe('INSERT INTO "User" ("id", "name") VALUES (\'alice\', \'Alice\')');
    } finally { await first.$disconnect(); }

    const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
    try {
      const env = { ...process.env, DATABASE_URL: `file:./${filename}` };
      const resolved = execFileSync(process.execPath, [prismaCli, "migrate", "resolve", "--applied", "202608200000_initial_schema"], { cwd: process.cwd(), env, encoding: "utf8" });
      const deployed = execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], { cwd: process.cwd(), env, encoding: "utf8" });
      expect(resolved).toContain("marked as applied");
      expect(deployed).toContain("All migrations have been successfully applied");
      const restarted = new PrismaClient({ datasources: { db: { url: absoluteUrl } } });
      try {
        expect(await restarted.$queryRawUnsafe<Array<{ name: string }>>('SELECT "name" FROM "User" WHERE "id" = \'alice\'')).toEqual([{ name: "Alice" }]);
        expect(await restarted.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ResearchSession','ExplorationWorkbench') ORDER BY name")).toEqual([
          { name: "ExplorationWorkbench" }, { name: "ResearchSession" },
        ]);
      } finally { await restarted.$disconnect(); }
    } finally { deleteFile(databasePath); }
  }, 30_000);
});
