# HANDOFF 交接文档 — 给 Codex（接手人）

> 接手前先读此文件，再读 `lib/types.ts`（冻结契约）和 `lib/agent/orchestrator.ts`（集成核心）。
> 验证命令永远是：`npm run lint && npm run test && npm run build`，三者全绿才算数。

## 责任包 02 整合状态（2026-08-22）

- 已验收并快进合入 `main`：`f4bc438`、`1fd42a0`、`06c743e`。
- `LibraryAgentOrchestrator.search()` 已接入 `catalogAdapter.searchCatalog()`；会传递概念、语言偏好、任务类型、用户水平和记忆摘要。
- 搜索 API 的请求/响应契约未改变；`taskType` 和 `level` 会影响实际馆藏排序。虫洞、记忆和联系人流程仍使用既有 fallback，等待责任包 03 达标后再接入。
- 责任包 02 的实验脚本为 `node node_modules/tsx/dist/cli.mjs scripts/experiment-ranking.ts`；交付材料位于 `outputs/package-02-*.md`。

## 0. 命名规范（强制，用户明确要求）

- 产品名唯一：**Wormhole Library Agent**（UI 内叫「Wormhole Library」）。
- **禁止使用 "PaperWorm" 作为产品/文档名**。PaperWorm 只允许作为**虫洞的一部分功能**（即「论文虫洞」功能模块的代号），不得出现在任何文档标题、README 标题、metadata、package name 中。
- 交接时已执行过一次命名归一：README.md、wormhole-library-agent-claude-code-design.md（-zh.md）的标题和产品定义句均已改为 Wormhole 命名，PaperWorm 只以功能模块身份出现。**接手后新增/修改文档时必须维持此约定**，若发现遗漏的 PaperWorm 产品级用法（如「PaperWorm 是一个…Agent」），改为「PaperWorm 是 Wormhole 的论文虫洞功能模块」。运行 `grep -rin "paperworm" . --include="*.md"` 可自查。
- 代码内概念统一：knowledge wormhole（虫洞）、serendipity slider（意外度滑块/探索距离控制器）、memory compiler（记忆编译）、living book（活书）、demo catalog（演示馆藏徽标）。

## 1. 当前状态（2026-08-21 深夜交接）

**已完成并验证通过：**

| 模块 | 状态 |
|---|---|
| 项目骨架（Next.js 15 + TS + Tailwind + Prisma schema） | ✅ 完成 |
| 冻结契约 `lib/types.ts`（卡片/API/模块接口） | ✅ 完成，v1.0 |
| 6 条冻结 API 路由 + 文献综述扩展（zod 校验 + 统一错误格式） | ✅ 完成，contract 测试覆盖 |
| Mock/fallback 全链路（search → wormholes → feedback → memory） | ✅ 完成，实测通过 |
| 电影感驾驶舱 UI（5 页面 + 8 组件 + React Flow 星图 + framer-motion） | ✅ 完成，Playwright 截图确认过 4 个页面 |
| Electron 桌面壳（`npm run desktop`） | ✅ 完成，实测窗口弹出 |
| 单元测试 | ✅ 当前 13/13 通过 |

**交接后公共功能更新（2026-08-21）：**

| 模块 | 状态 |
|---|---|
| 文献综述 `POST /api/review` | ✅ 已实现；3–5 条 demo catalog 资源，Ollama 不可用时返回标注为 `concat` 的摘要拼接结果 |
| 文献综述工作台 `/review` | ✅ 已实现；可选材料、选择综述视角、显示降级来源 |
| 责任包 03 | ❌ 未通过；详见 `docs/RESPONSIBILITY-PACKAGE-03-ACCEPTANCE.md`，不得提前整合 |

最新验证：`npm run lint && npm run test && npm run build` 全部通过；生产构建包含 14 条 app 路由。

**最后一次验证（交接时）：**
```
npm run lint   → No ESLint warnings or errors
npm run build  → 12 routes 构建成功
npm run test   → 12 passed（2 files）
```

**未提交**：所有改动都在工作区（git status 大量 M/A），接手后自行决定 commit 时机。

**未启动过**：Prisma 数据库从未建过（无 dev.db、无 .env）——app 目前**完全运行在 in-memory fallback 上，这是设计内行为**，见 §5。

## 2. 命令

```bash
npm run dev        # 网页模式（开发）
npm run desktop    # 桌面应用（Electron 壳，自动拉起/复用本地服务）
npm run lint       # ESLint（next lint，注意有 deprecation 提示但可用）
npm run test       # Vitest
npm run build      # 生产构建
npm run db:push    # 建 SQLite 表（尚未执行过）
npm run db:seed    # 灌 data/*.json 进 SQLite（尚未执行过）
```

## 3. 架构与数据流

```
页面/组件（客户端 fetch）
  → API routes（app/api/*/route.ts，只做 zod 校验 + 转发）
  → LibraryAgentOrchestrator（lib/agent/orchestrator.ts，单例）
  → fallbackEngine（lib/mock/fallbackEngine.ts，确定性算法）
  → data/*.json（seed：concepts/edges/resources/living-books）
  → store（lib/mock/store.ts，globalThis 上的内存 Map）
```

- **API route 永远不直接调 fallback 或队友模块，只调 orchestrator。**
- orchestrator 里有 5 处 `INTEGRATION POINT [队友02]` / `[队友03]` 注释，是队友模块接入的全部位置。
- 内存 store 挂在 `globalThis.__wormholeDemoStore`：dev 热重载不丢，**服务重启即清空**（interaction 记录和 memory 变化都会消失）。这是已知行为，demo 前要重新走一遍流程即可。

## 4. 冻结契约（改动禁区）

`lib/types.ts` 是唯一契约文件。规则：

1. 只允许**加可选字段**；禁止改名、删字段、改必填字段类型。
2. 既有 6 条 API 路由的路径和请求/响应结构冻结；新增扩展接口必须在 `lib/types.ts` 与 contract 测试中单独定义，并继续使用统一错误格式 `{error:{code,message}}`。当前扩展为 `POST /api/review`。
3. 队友模块接口签名冻结：`CatalogAdapter`、`LivingLibraryService`（队友02）；`WormholeEngine`、`ConceptExtractor`、`MemoryCompiler`（队友03）。
4. 改契约前必须重跑 contract 测试（`tests/unit/api-contract.test.ts`），红了就是破坏了契约。

## 5. 待办（Day 2/3 路线图，按优先级）

1. **Prisma 接入**：建 `.env`（DATABASE_URL="file:./dev.db"），跑 `db:push` + `db:seed`，然后把 store 从内存切到 DB。切换点在 `lib/mock/store.ts` 全部函数 + orchestrator 里的存储调用。切换后保持 API 响应结构不变。
2. **队友模块接入**：在 orchestrator 搜 `INTEGRATION POINT`，替换 fallback 调用；队友数据扩充 `data/*.json`（concepts 50+ / edges 80+ / resources 30+ / living-books 6+），**字段结构不动，seed 脚本自动兼容**。
3. **人物匹配闭环**：`/api/matches` 目前用 Living Library 数据合成；待队友02/03 的 collision 算法接入后替换。
4. **地图页增强**：`/map/[interactionId]` 已能用（React Flow 分类型节点），但节点布局简单，可加力导向或按 domain 分组。
5. **移动端检查**：组件用 flex-wrap + truncate + line-clamp 防溢出，但未在真机宽度验证；重点看 Explore 页右栏和虫洞路径卡。
6. **e2e 测试**（可选）：Playwright 走 demo 路径（搜索 → 滑块 70 → 开洞 → 反馈 too_hard → memory 页数值变化）。
7. **桌面打包**（可选）：目前 `npm run desktop` 是开发形态；打包分发需要 electron-builder。

## 6. 已知坑（重要）

1. **ELECTRON_RUN_AS_NODE**：VS Code / Codex 等集成终端里此环境变量=1 会让 electron 退化成纯 Node 崩溃。已在 `desktop/launch.js` 里清除，`npm run desktop` 必须走 launch.js，不要直接调 `electron desktop/main.js`。
2. **electron postinstall**：npm 的 allow-scripts 安全策略会拦截 electron 二进制下载。若重装依赖后 electron 报错，跑 `npm approve-scripts electron` 再 `node node_modules/electron/install.js`（package.json 已记录 allowScripts）。
3. **StarMap 必须在客户端挂载后渲染**（React Flow 的节点 transform 会触发 SSR hydration mismatch），已有 `mounted` guard，改的时候别删。
4. **Next 15 动态路由 params 是 Promise**：`app/explore/[interactionId]/page.tsx` 和 map 页用 `use(params)`，别退回旧写法。
5. **globals.css 首三行 `@tailwind` 指令不能动**，`.cockpit-range` 滑块样式在 @layer components 里，Slider 组件依赖它。
6. **路径别名 `@/*` 指向仓库根**，队友模块的 import 用它，别改成相对路径。
7. **`next lint` 已废弃**（Next 16 会移除），现在能用；若要迁移到 ESLint CLI 需调整 `.eslintrc.json` 和 scripts。
8. **zh 文案里有中文引号「」没问题**，但 ASCII 双引号在 JSX 文本里会触发 `react/no-unescaped-entities`，写文案时注意。

## 7. 设计系统（Tailwind tokens，tailwind.config.ts）

| Token | 值 | 用途 |
|---|---|---|
| `ink` / `ink-panel` / `ink-raise` | #0A0E16 / #0E141F / #131A29 | 背景三层 |
| `ink-border` / `ink-edge` | #1C2740 / #2A3A5C | 边框 |
| `ivory` | #EDEFF4 | 主文字 |
| `steel` / `steel-dim` | #8B98AE / #5C6A82 | 次级文字 |
| `pulse` / `pulse-dim` / `pulse-faint` | #33D6E2 / #17919E / #0E3A44 | 虫洞/电青 |
| `copper` / `copper-dim` / `copper-faint` | #D9A050 / #93662C / #3A2C14 | 馆藏/铜金 |
| `rosewood` | #E5484D | 危险/太远（少量） |

规则：6-8px 圆角（rounded-md/lg）、细边框、无玻璃拟态、无大面积紫蓝渐变。组件底座：`Panel/PanelHeader/PanelBody`、`Button`（solid/outline/ghost/copper/danger + loading）、`Badge`（cyan/copper/steel/rose/ivory）、`Input`。

## 8. 关键文件索引

| 文件 | 作用 | 谁动 |
|---|---|---|
| `lib/types.ts` | 冻结契约（唯一事实来源） | 改动前读 §4 |
| `lib/agent/orchestrator.ts` | 集成核心，INTEGRATION POINT 全部在这 | 队友01 |
| `lib/mock/fallbackEngine.ts` + `store.ts` | 确定性 fallback + 内存存储 | 队友01（Day2 被替换） |
| `lib/memory/compileFeedback.ts` | Memory Compiler fallback 版 | 队友03 替换内部实现 |
| `lib/review/index.ts` + `app/api/review/route.ts` | 文献综述服务与 API；无 LLM 时明确 `concat` 降级 | 队友01 |
| `app/review/page.tsx` | 文献综述工作台 | 队友01 |
| `docs/RESPONSIBILITY-PACKAGE-03-ACCEPTANCE.md` | 责任包 03 未通过验收的证据和补交清单 | 队友01 / 队友03 |
| `lib/starmap.ts` | 星图布局/匹配纯函数（与 fallback 同规则） | 队友01 |
| `data/*.json` | seed 数据（字段冻结，内容扩充） | 队友02/03 |
| `tests/unit/*` | contract + smoke，12 个用例 | 队友01 |
| `responsibility-packages/` | 三人责任包（含 01 的决策记录表） | 全员 |

## 9. 接手后的标准验证循环

```bash
npm run lint && npm run test && npm run build   # 每次改动后
npm run dev                                      # 然后人工/Playwright 走一遍：
#  / → 输入 "AI Agent" → /explore/[id] → 滑块 70 → 打开虫洞 → 反馈「太难了」→ /memory 数值变化
```

demo 验收一句话：**输入 AI Agent → 滑块 70 → 看到 AI Agent → Multi-Agent Coordination → Game Theory → Mechanism Design 的虫洞 → 反馈后 /memory 的 mathTolerance 从 0.50 下降。**
