/**
 * Wormhole Library Agent — Electron 桌面壳（队友01）
 *
 * 设计原则：对 Next.js 应用零侵入。
 *  - 启动时检测 localhost:3000 是否已有 dev server（队友可能已在跑）
 *  - 没有就自己 spawn `npm run dev`，窗口关闭时负责杀掉
 *  - 窗口只是加载 http://localhost:3000 的壳，Web 模式永远可用（demo 保底）
 */
const { app, BrowserWindow, shell } = require("electron");
const { spawn, execSync } = require("child_process");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.WORMHOLE_PORT || 3000);
const APP_URL = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, "..");
const PACKAGED_SERVER_ROOT = path.join(process.resourcesPath, "app-server");

let serverProcess = null;
let ownServer = false; // 只有自己拉起的 server 才由我们负责关闭

function serverIsUp() {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  if (await serverIsUp()) return; // 已有 dev server，复用

  ownServer = true;
  if (app.isPackaged) {
    const serverEntry = path.join(PACKAGED_SERVER_ROOT, "server.js");
    serverProcess = spawn(process.execPath, [serverEntry], {
      cwd: PACKAGED_SERVER_ROOT,
      stdio: "ignore",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(PORT) },
    });
  } else {
    serverProcess = spawn("npm", ["run", "dev"], {
      cwd: ROOT,
      shell: true,
      stdio: "ignore",
      env: { ...process.env, PORT: String(PORT) },
    });
  }

  // 最多等 90 秒（首次编译可能较慢）
  for (let i = 0; i < 90; i++) {
    if (await serverIsUp()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Next.js server did not start on ${APP_URL}`);
}

function killServer() {
  if (!ownServer || !serverProcess) return;
  try {
    if (process.platform === "win32") {
      // shell:true 会有 cmd 包一层，必须杀整棵进程树
      execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: "ignore" });
    } else {
      serverProcess.kill("SIGTERM");
    }
  } catch {
    /* 进程可能已退出 */
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
    backgroundColor: "#0f1117", // 与 globals.css --bg 一致，避免白屏闪烁
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 外部链接（如 sourceUrl）用系统浏览器打开，不在应用内跳转
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(APP_URL);
}

app.whenReady().then(async () => {
  try {
    await ensureServer();
    await createWindow();
  } catch (err) {
    console.error(err);
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
