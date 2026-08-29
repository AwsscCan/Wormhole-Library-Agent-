# Wormhole Library Agent

一个可恢复的个人研究工作区：从主题检索出发，把馆藏、知识虫洞、个人星图、私有笔记、记忆和证据约束写作放进同一条持久化流程。

PaperWorm 仅指 Wormhole Library Agent 中的论文虫洞功能，不是产品名。

## 当前可用流程

- 访客身份：首次访问自动建立签名访客身份，刷新和服务重启后仍可恢复私有研究会话。
- 账户系统：邮箱密码注册、登录、退出；当前版本不要求邮箱验证。
- 研究工作区：首页检索会创建持久化 `ResearchSession`，保存检索快照、证据篮、虫洞和个人图编辑。
- 来源透明馆藏：显示来源状态和 provenance；外部来源不可用时明确降级到本地种子馆藏。
- 证据约束写作：发现候选、人工确认、选择模型预设、生成草稿、证据回链、人工复核、Markdown 导出和 checkpoint 恢复。
- 私有工具：账户隔离的 Markdown 笔记、Provider 配置、模型预设和当前身份记忆页。
- 探索工作台：个人图、历史记忆上下文、推荐反馈和工作台恢复。
- 外观设置：在统一设置中心切换深夜纸墨、山水墨卷和抽象构成，选择会跨页面持久保留。

`/explore/[interactionId]`、`/api/search` 等 V1 路径只为兼容旧演示保留。新的用户流程从 `/` 或 `/research` 进入，不依赖易失的内存 interaction。

## 技术栈

- Next.js 15、React 19、TypeScript、Tailwind CSS
- Prisma + SQLite
- Better Auth
- React Flow、Framer Motion
- Vitest

## 本地启动

1. 安装依赖。

```bash
npm install
```

2. 从 `.env.example` 创建本地环境文件，并替换其中的认证和加密占位值。

```bash
cp .env.example .env.local
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env.local
```

开发环境至少需要：

```dotenv
DATABASE_URL="file:./dev.db"
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET="独立随机密钥"
AUTH_SECRET="另一条独立随机密钥"
WRITING_CONFIG_ENCRYPTION_KEY="独立的 32 字节密钥"
```

3. 部署迁移并灌入演示馆藏。

```bash
npm run db:deploy
npm run db:seed
```

4. 启动 Web 应用。

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。Electron 壳可通过 `npm run desktop` 启动，但浏览器 Web 应用是完整体验入口。

## 打包 Web 应用

项目包含服务端 API，因此 Web 交付物是可部署的 Next.js standalone 服务，不是只能展示静态页面的导出目录。

```bash
npm run package:web
```

构建完成后，运行包位于 `dist/wormhole-library-agent-web/`。配置生产环境变量和数据库迁移后，在该目录执行：

```bash
node server.js
```

公开部署前请同时阅读 [Web 部署说明](docs/WEB-DEPLOYMENT.md) 和 [部署门禁](docs/DEPLOYMENT-GATES.md)。

## 验收路径

1. 首页输入 `AI Agent`，选择任务、水平和探索距离，启动探索。
2. 在 `/research/<sessionId>/explore/<interactionId>` 刷新页面，确认检索仍可恢复并生成虫洞。
3. 打开写作工作台，发现候选并人工确认至少 3 条证据。
4. 生成草稿，依次完成证据回链和人工复核，再导出 Markdown。
5. 刷新写作页，确认 checkpoint、阶段、正文和引用恢复。
6. 在研究笔记中保存一条 Markdown 笔记，刷新确认仍存在。
7. 在 `/auth` 注册或登录，确认导航显示账户身份并可退出。

## 验证命令

```bash
npm run lint
npm run test:unit
npm run build
```

## 降级与边界

- 未配置 Provider 时，写作使用带证据标记的 deterministic 草稿，并明确标注来源。
- OpenAlex 或其他上游不可用时，馆藏端口返回来源状态并使用本地种子数据，不伪装成实时结果。
- Provider 密钥只在服务端加密保存，浏览器列表只显示“已配置”状态。
- 生产部署必须遵守 [docs/DEPLOYMENT-GATES.md](docs/DEPLOYMENT-GATES.md)，尤其是独立密钥、可信反向代理和迁移门禁。
- 活馆藏仍是 consent-safe 演示目录；匿名交流请求当前只返回 pending 状态，不发送真实站外消息。

## 关键文档

- [最终整合设计](docs/superpowers/specs/2026-08-28-final-integration-design.md)
- [最终整合计划](docs/superpowers/plans/2026-08-28-final-integration.md)
- [部署门禁](docs/DEPLOYMENT-GATES.md)
- [Codex 交接记录](docs/HANDOFF-CODEX.md)
