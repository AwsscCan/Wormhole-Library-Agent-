const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn, execSync } = require("child_process");
const { randomBytes } = require("crypto");
const {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PACKAGED_SERVER_ROOT = path.join(process.resourcesPath, "app-server");
const requestedPort = Number(process.env.WORMHOLE_PORT || 3000);

let port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536
  ? requestedPort
  : 3000;
let appUrl = `http://127.0.0.1:${port}`;
let serverProcess = null;
let serverExit = null;
let ownServer = false;

function serverIsUp() {
  return new Promise((resolve) => {
    const req = http.get(appUrl, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function portIsAvailable(candidate) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen(candidate, "127.0.0.1", () => {
      probe.close(() => resolve(true));
    });
  });
}

async function selectPackagedPort() {
  if (process.env.WORMHOLE_PORT) {
    if (!(await portIsAvailable(port))) throw new Error(`Port ${port} is already in use`);
    return;
  }

  for (let candidate = port; candidate < port + 100; candidate += 1) {
    if (await portIsAvailable(candidate)) {
      port = candidate;
      appUrl = `http://127.0.0.1:${port}`;
      return;
    }
  }
  throw new Error("No available local port was found");
}

function loadOrCreateDesktopSecrets(dataRoot) {
  const configPath = path.join(dataRoot, "desktop-secrets.json");
  if (existsSync(configPath)) {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    const valid = [parsed.betterAuthSecret, parsed.authSecret, parsed.writingEncryptionKey]
      .every((value) => typeof value === "string" && value.length >= 32);
    if (!valid) throw new Error(`Desktop secret configuration is invalid: ${configPath}`);
    return parsed;
  }

  const secrets = {
    betterAuthSecret: randomBytes(32).toString("base64url"),
    authSecret: randomBytes(32).toString("base64url"),
    writingEncryptionKey: randomBytes(32).toString("base64"),
  };
  const temporaryPath = `${configPath}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(secrets, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, configPath);
  return secrets;
}

function createPackagedEnvironment() {
  const dataRoot = path.join(app.getPath("userData"), "runtime");
  mkdirSync(dataRoot, { recursive: true });

  const databasePath = path.join(dataRoot, "wormhole.db");
  if (!existsSync(databasePath)) {
    const templateDatabase = path.join(PACKAGED_SERVER_ROOT, "prisma", "dev.db");
    if (!existsSync(templateDatabase)) throw new Error(`Packaged database is missing: ${templateDatabase}`);
    copyFileSync(templateDatabase, databasePath);
  }

  const secrets = loadOrCreateDesktopSecrets(dataRoot);
  const standaloneModules = path.join(PACKAGED_SERVER_ROOT, "node_modules");
  const packagedModules = path.join(process.resourcesPath, "app.asar", "node_modules");
  const nodePath = [standaloneModules, packagedModules, process.env.NODE_PATH]
    .filter(Boolean)
    .join(path.delimiter);

  return {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || secrets.authSecret,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || secrets.betterAuthSecret,
    BETTER_AUTH_URL: appUrl,
    DATABASE_URL: process.env.DATABASE_URL || `file:${databasePath.replace(/\\/g, "/")}`,
    ELECTRON_RUN_AS_NODE: "1",
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    NODE_PATH: nodePath,
    PORT: String(port),
    WRITING_CONFIG_ENCRYPTION_KEY: process.env.WRITING_CONFIG_ENCRYPTION_KEY || secrets.writingEncryptionKey,
  };
}

function desktopLogPath() {
  return path.join(app.getPath("userData"), "desktop-server.log");
}

function startPackagedServer() {
  const serverEntry = path.join(PACKAGED_SERVER_ROOT, "server.js");
  if (!existsSync(serverEntry)) throw new Error(`Packaged server is missing: ${serverEntry}`);

  const logPath = desktopLogPath();
  appendFileSync(logPath, `\n[${new Date().toISOString()}] Starting ${serverEntry} on ${appUrl}\n`, "utf8");
  const logDescriptor = openSync(logPath, "a");
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: PACKAGED_SERVER_ROOT,
    stdio: ["ignore", logDescriptor, logDescriptor],
    env: createPackagedEnvironment(),
    windowsHide: true,
  });
  closeSync(logDescriptor);

  serverProcess.once("error", (error) => {
    serverExit = `Unable to start the packaged server: ${error.message}`;
  });
  serverProcess.once("exit", (code, signal) => {
    serverExit = `Packaged server exited (code ${code ?? "none"}, signal ${signal ?? "none"})`;
  });
}

async function ensureServer() {
  if (!app.isPackaged && await serverIsUp()) return;

  ownServer = true;
  if (app.isPackaged) {
    await selectPackagedPort();
    startPackagedServer();
  } else {
    serverProcess = spawn("npm", ["run", "dev"], {
      cwd: ROOT,
      shell: true,
      stdio: "ignore",
      env: { ...process.env, PORT: String(port) },
    });
  }

  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (serverExit) throw new Error(serverExit);
    if (await serverIsUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Local server did not become ready at ${appUrl}`);
}

function killServer() {
  if (!ownServer || !serverProcess) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: "ignore" });
    } else {
      serverProcess.kill("SIGTERM");
    }
  } catch {
    // The process may already have exited.
  }
  serverProcess = null;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Wormhole Library Agent",
    backgroundColor: "#0f1117",
    icon: path.join(__dirname, "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const localOrigin = new URL(appUrl).origin;
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).origin === localOrigin) return { action: "allow" };
    } catch {
      // Invalid external URLs are denied below.
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(appUrl);
}

app.whenReady().then(async () => {
  try {
    await ensureServer();
    await createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const logPath = desktopLogPath();
    appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
    dialog.showErrorBox(
      "Wormhole Library Agent could not start",
      `${message}\n\nStartup log: ${logPath}`,
    );
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  killServer();
  app.quit();
});

app.on("before-quit", killServer);
