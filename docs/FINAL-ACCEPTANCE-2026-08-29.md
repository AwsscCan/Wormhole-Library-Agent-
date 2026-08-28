# 最终可用性验收记录（2026-08-29）

## 结论

Wormhole Library Agent 的主 Web 流程已从易失的 V1 演示链路切换到持久化、按服务端身份隔离的研究工作区。验收不再以“测试和构建通过”代替真实用户流程。

## 本次修复

1. 首页探索改为创建 `ResearchSession`、执行 session action 并跳转 `/research/<sessionId>/explore/<interactionId>`。
2. 首页任务类型、用户水平和探索距离实际传入检索；探索距离随深链传递。
3. 新增登录/注册页与导航身份状态，支持退出登录。
4. 写作页自动加载当前身份的研究会话、候选、模型预设和 checkpoint，不再要求手输 session/evidence ID。
5. 候选确认后通过正式写作端口写回研究会话证据篮；确认和重复发现均保持幂等。
6. 修复 Next.js 生产构建中写作端口跨模块实例丢失的问题，改为进程级注册表。
7. 写作候选复用概念抽取和种子馆藏排序；离线种子记录可在满足作者、匹配和稳定内部 ID 证据时人工确认。
8. 草稿 API 返回真实阶段；恢复只识别当前候选集合中的证据标记，checkpoint 可恢复正文、引用和复核阶段。
9. 新增 `/api/v3/memory`，记忆页按当前服务端身份读取和重置，不再使用固定 `demo-user`。
10. `.env.example` 和 README 补齐数据库、认证、访客签名与写作加密配置。
11. 首屏先完成签名访客身份引导，研究会话响应也回写 Cookie，消除首次并发请求生成不同 guest 的竞态。
12. P05 推荐反馈正式写入 P04 owner/session-scoped 事件；持久化失败会回滚进程内事件并允许安全重试；“重置我的记忆”同时清除当前 owner 的 P04 私有 RAG，其他 owner 不受影响。

## 浏览器验收证据

在生产构建 `next start --port 3001` 上执行：

- 首页输入 `AI Agent`，创建持久化研究会话并进入 research explore 深链。
- 刷新深链后恢复 `AI Agent` 检索，没有出现“找不到这次探索记录”。
- 停止并重启 Next.js 服务后，再次刷新同一深链，检索仍恢复；虫洞可继续生成。
- 写作页发现 11 条候选；人工确认 3 条后，研究会话显示 3 条证据。
- 生成 deterministic 草稿，正文含 3 个允许的 evidence marker。
- 完成 `draft -> evidence_link -> human_review -> export`，服务端允许 Markdown 导出。
- 刷新写作页后恢复 `export` 阶段、草稿正文和 3 条引用，页面标记“已恢复”。
- 私有笔记保存后刷新仍出现在当前访客工作区。
- Provider/模型预设设置页可加载，未配置 Provider 时写作明确使用 deterministic 降级。
- `/auth` 可见登录/注册切换、邮箱密码表单和访客工作区入口。

## 自动化门禁

- `npm run lint`：无 warning/error。
- `npm run test:unit`：64 个测试文件、407 个测试全部通过。
- `npm run test`：含性能套件共 65 个测试文件、417 个测试全部通过。
- `npx tsc --noEmit`：类型检查通过。
- `npm run build`：生产构建通过。
- Better Auth Prisma 集成测试覆盖注册、登录、session Cookie 和 member principal 解析。

## 诚实边界

- 活馆藏当前是 consent-safe 演示目录；登记状态只在页面内演示，匿名交流请求只返回 pending，不发送真实站外消息。
- `/explore/[interactionId]` 等 V1 页面继续为旧链接兼容保留，仍使用旧接口；主导航流程不再依赖它。
- 未配置真实 Provider 时，写作不会声称调用了模型，而是返回可追溯 deterministic 草稿。
- 外部馆藏不可用时会显示来源降级；离线种子数据不会伪装成实时外部结果。
