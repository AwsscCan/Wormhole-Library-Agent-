# 最终整合自检记录（2026-08-29）

## 结论

当前 `codex/final-integration` 已完成正式仓库的主流程整合、交付材料和 Web/Windows 打包配置。默认主题保持“深夜纸墨”；数学建模工作流没有进入可见工作流目录；研究工作区馆藏总图复用实时 Open Library 星图；文献综述入口收敛到探索台，写作台只负责证据约束写作。

## 本轮变更

- `app/writing/page.tsx` 隐藏 `literature_review` 工作流入口；历史 URL 参数安全落到 `evidence_section`，底层模板和历史工件仍可恢复。
- `app/review/page.tsx` 回到 `/research`，避免重复的独立综述台。
- `app/page.tsx` 将目标驱动入口和结果区改为“AI 全量搜索 / AI 搜索总结 · 全部候选”，显示查询路径、全量候选数量、相关性初选和来源核验边界；移除“进入写作”误导入口。
- `OpenLibraryStarMap` 支持实时分类搜索、父子星连线、递归下钻、返回上一级和书目原始链接。
- 研究工作区“馆藏总图”复用 `OpenLibraryStarMap`；个人星图保留距离滑块、搜索频次亮度、混合记忆图层、节点/关系编辑和删除恢复。
- Electron 增加生产 standalone 服务启动分支和 Windows NSIS 配置；桌面包不依赖目标机源码或开发服务器。`0.1.1` 修复了打包后 standalone 服务无法解析 ASAR 依赖的问题，并为窗口、可执行文件、安装器和快捷方式统一使用项目图标。
- 新增项目简介、详尽演示视频稿，并让 Web 包携带这两份材料。
- 集成测试的 SQLite 临时数据库统一迁移到系统临时目录，并使用 Prisma 可解析的绝对 `file:` URL，避免受限环境向源码目录写测试数据库。

## Evidence → Finding → Path

| Evidence | Finding | Path |
|---|---|---|
| `npx tsc --noEmit` exit 0 | TypeScript 类型检查通过 | `app/page.tsx`, `app/writing/page.tsx`, `components/OpenLibraryStarMap.tsx` |
| `npm run lint` exit 0 | ESLint 检查通过，无新增 lint 问题 | `components/PersonalGraphWorkspace.tsx` 等 |
| 定向 UI/组合测试 3 文件、16 用例通过 | 写作入口、工作区 UI 和组合绑定未回归 | `tests/unit/writing-workflow-catalog.test.ts`, `tests/unit/workspace-ui.test.ts`, `tests/unit/app-composition.test.ts` |
| `npx vitest run --no-cache`：74 文件、451 用例通过 | 单元、性能、路由、迁移、RAG、星图、认证和写作回归全部通过 | `tests/unit/`, `tests/performance/` |
| `npm run build` exit 0 | Next standalone 生产构建通过 | `.next/standalone/server.js` |
| standalone HTTP：`/`, `/research`, `/writing`, `/settings/catalog-sources`, `/living-library`, `/auth` 全部 200 | 生产服务入口可启动并响应 | `http://localhost:3012` |
| Open Library API HTTP 200，`Artificial intelligence` 返回 3 条作品 | 真实外部馆藏接口可访问 | `/api/v3/catalog/openlibrary/subjects` |
| `npm run package:web` 成功 | Web 可部署包已生成，且携带项目简介和演示稿 | `dist/Wormhole-Library-Agent-Web.zip` |
| Electron Builder NSIS 成功 | Windows 安装包已生成；未签名，发布时应由发布方签名 | `dist/desktop/Wormhole Library Agent Setup 0.1.1.exe` |

## 交付物

- 项目简介：[PROJECT-INTRODUCTION.md](PROJECT-INTRODUCTION.md)
- 演示视频稿：[DEMO-VIDEO-SCRIPT.md](DEMO-VIDEO-SCRIPT.md)
- Web 部署包：`dist/Wormhole-Library-Agent-Web.zip`
- Windows 安装包：`dist/desktop/Wormhole Library Agent Setup 0.1.1.exe`
- Web 部署说明：[WEB-DEPLOYMENT.md](WEB-DEPLOYMENT.md)
- 发布门禁：[DEPLOYMENT-GATES.md](DEPLOYMENT-GATES.md)

## 仍需发布方完成的事项

- GitHub 远程地址已经配置为 `https://github.com/AwsscCan/Wormhole-Library-Agent-.git`，本地改造已完成；是否公开可见和最终推送需要仓库维护者的 GitHub 权限，本轮没有擅自推送。
- Windows 安装器当前未签名，Windows SmartScreen 可能提示未知发布者；正式分发前使用组织证书签名。
- 生产环境必须配置独立的认证、写作加密密钥、数据库和反向代理，不得使用 `.env.example` 占位值。
- 高校 SSO、校园网/IP 白名单、订阅数据库和付费全文只在用户或机构已授权的前提下接入；应用不会绕过这些边界。
- Open Library 和其他公共来源受网络、限流和上游可用性影响；页面保留来源状态和降级提示。
- 本轮浏览器桥接在本地页面读取时发生工具超时，因此使用 standalone HTTP、真实外部 API 和自动化测试完成验证；不将该工具超时表述为应用错误。
