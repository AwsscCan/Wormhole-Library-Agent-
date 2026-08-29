import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "dist");
const output = path.join(distRoot, "wormhole-library-agent-web");
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  throw new Error("Missing .next/standalone/server.js. Run npm run build first.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(standalone, output, { recursive: true });
await mkdir(path.join(output, ".next"), { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(output, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) {
  await cp(path.join(root, "public"), path.join(output, "public"), { recursive: true });
}
await cp(path.join(root, "prisma"), path.join(output, "prisma"), { recursive: true });
await cp(path.join(root, ".env.example"), path.join(output, ".env.example"));
await cp(path.join(root, "docs", "WEB-DEPLOYMENT.md"), path.join(output, "WEB-DEPLOYMENT.md"));
await writeFile(path.join(output, "START.txt"), [
  "Wormhole Library Agent - standalone Web package",
  "",
  "1. Provision a database with the migrations in ./prisma/migrations.",
  "2. Set the environment variables documented in .env.example.",
  "3. Set HOSTNAME=0.0.0.0 and PORT as needed.",
  "4. Run: node server.js",
  "",
  "See WEB-DEPLOYMENT.md for production gates.",
].join("\n"), "utf8");

console.log(output);
