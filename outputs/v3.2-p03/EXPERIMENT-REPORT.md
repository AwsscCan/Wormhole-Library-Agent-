# V3.2 责任包 03 对照实验

版本：v3.2-p03-schema-2
布局种子：deterministic-radial-v1（无随机源）
固定时间：2026-08-24T12:00:00.000Z
持久化：Prisma/SQLite migration 202608250001

| 主题 | 搜索 | 证据 | 图版本 | 重启恢复 | 公共图 |
|---|---:|---:|---:|---|---|
| RAG retrieval quality | 1 | 2 | 1 | 通过 | 未变 |
| Scheduling fairness | 1 | 2 | 1 | 通过 | 未变 |
| Graph discovery | 1 | 2 | 1 | 通过 | 未变 |

## 四组对照结论

1. 个性化图：首页 `StarMap` 未修改；三张会话图均包含主题、搜索、概念和两条资源证据。
2. 可编辑持久化：位置、固定、隐藏系统边、个人标签、注释和 `personal_note` 边在新 PrismaClient 恢复后一致。
3. 图谱保护：系统图哈希编辑前后相同，三个 seed/consent 文件 SHA-256 前后相同。
4. 节点行动：`research-workflow.test.ts` 验证 search/library 均保留 sessionId；search interaction 与馆藏资源快照均写回会话，馆藏证据和资源节点在服务重启后可恢复。

## 可重复 API 闭环

运行 `npx vitest run tests/unit/research-api-e2e.test.ts tests/unit/research-prisma-store.test.ts --pool forks --poolOptions.forks.singleFork`。覆盖包01身份端口注入、创建、原子编辑、重启恢复、跨所有者 404、并发冲突和数据库迁移。

## 技术说明

个人主题星图采用“系统知识层 + 用户工作层”双层结构。系统层由概念、虫洞和经同意的活书构成，用户层只保存位置、显示状态、注释和个人关联。因此研究者能重组自己的探索路径，同时不会污染公共知识图或绕过隐私规则。主题节点可把图上的理解直接转化为下一次检索或馆藏发现。
