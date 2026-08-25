# 可重复 UI 验收

1. 绑定包01身份端口、包02来源透明端口；运行 `npm run dev`。
2. 打开 `/research/<sessionId>/workbench`，依次选择低/中/高并生成，核对配额标签与四类理由。
3. 将资源加入阅读计划，填写目标、完成定义和下一步动作；在概念图添加个人边。
4. 在证据图添加主张、来源证据、support/refute/background/to_verify 关系和草稿段落，点击反链返回带同一 sessionId 的资源节点。
5. 保存后重启服务并重新打开；三视图与阅读状态应恢复。用另一个 owner 访问应为 404。
6. 断开 MemoryReadPort 或来源端口，界面必须显示“无历史记忆模式”或“显式降级”，而不是正常零结果。

自动化对应：`workbench-contract.test.ts`、`workbench-prisma-store.test.ts`、`workbench-links.test.ts`。
