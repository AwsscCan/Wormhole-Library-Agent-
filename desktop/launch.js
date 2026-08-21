/**
 * 桌面壳启动器（用 node 运行）：
 *   node desktop/launch.js   （即 npm run desktop）
 *
 * 为什么需要它：如果终端环境里带有 ELECTRON_RUN_AS_NODE=1
 * （某些 Electron 宿主如 VS Code / Claude Code 的集成终端会注入），
 * 直接跑 electron 会退化成纯 Node，报 "Cannot read properties of
 * undefined (reading 'whenReady')"。这里统一清掉再启动。
 */
const { spawn } = require("child_process");
const path = require("path");

const electronBinary = require("electron"); // 在纯 Node 下返回二进制路径字符串

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [path.join(__dirname, "main.js")], {
  env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
