# 责任包 03 可重复集成闭环

日期：2026-08-25

执行：

```powershell
$env:CIRCLE_NODE_TOTAL='1'
npx vitest run tests/unit/research-api-e2e.test.ts tests/unit/research-prisma-store.test.ts tests/unit/research-private-routes.test.ts --pool forks --poolOptions.forks.singleFork
Remove-Item Env:CIRCLE_NODE_TOTAL
```

覆盖路径：

1. 包01 `CurrentPrincipalPort` 接收真实 Request/cookie，并返回 member/guest 主体；包03不解析认证数据。
2. 创建私有会话，编辑个人图并以 owner + graphVersion 原子更新。
3. 使用新的 PrismaClient 重新读取同一 SQLite 数据库，位置、固定、隐藏、标签、注释与个人边保持一致。
4. member/guest 和两个 member 之间跨 owner 读取均返回 404。
5. 所有 `app/api/research/**` 响应，包括错误响应，均带 `Cache-Control: private, no-store`。
6. 未绑定包01端口返回 503；未绑定包02来源透明端口返回显式 degraded 状态，不伪装为“无结果”。
