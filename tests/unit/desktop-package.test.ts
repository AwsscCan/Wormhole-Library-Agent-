import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const mainSource = readFileSync(path.join(root, "desktop", "main.js"), "utf8");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  version: string;
  build: {
    extraResources: Array<{ from: string; to: string }>;
    win: { icon: string; signExecutable: boolean };
  };
};

describe("desktop package runtime", () => {
  it("resolves standalone dependencies from ASAR and checks the IPv4 server origin", () => {
    expect(mainSource).toContain('path.join(process.resourcesPath, "app.asar", "node_modules")');
    expect(mainSource).toContain('path.join(PACKAGED_SERVER_ROOT, "node_modules")');
    expect(mainSource).toContain('appUrl = `http://127.0.0.1:${port}`');
    expect(mainSource).toContain('NODE_PATH: nodePath');
  });

  it("initializes private desktop state and surfaces startup failures", () => {
    expect(mainSource).toContain('app.getPath("userData")');
    expect(mainSource).toContain('DATABASE_URL: process.env.DATABASE_URL');
    expect(mainSource).toContain('WRITING_CONFIG_ENCRYPTION_KEY:');
    expect(mainSource).toContain('dialog.showErrorBox(');
    expect(mainSource).toContain('desktop-server.log');
  });

  it("ships the server, template database, and branded Windows icon", () => {
    expect(packageJson.version).not.toBe("0.1.0");
    expect(packageJson.build.extraResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: ".next/standalone", to: "app-server" }),
      expect.objectContaining({ from: "prisma", to: "app-server/prisma" }),
      expect.objectContaining({
        from: ".next/standalone/node_modules/.prisma",
        to: "app-server/node_modules/.prisma",
      }),
    ]));
    expect(packageJson.build.win).toMatchObject({
      icon: "desktop/assets/icon.ico",
      signExecutable: false,
    });
  });
});
