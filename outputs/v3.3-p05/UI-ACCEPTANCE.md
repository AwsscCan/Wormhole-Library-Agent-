# 可重复 UI 验收

1. 绑定包01身份端口、包02来源透明端口和包04 `MemoryReadPort.search/listInferredPreferences`；运行 `npm run dev`。
2. 打开 `/research/<sessionId>/workbench`，改变会话证据或记忆召回后生成，核对候选分档、分数、来源 ID 和四类理由随输入改变。
3. 点击推荐的星图入口，星图必须出现并聚焦该私有资源投影；点击星图“返回工作台证据/草稿”应回到同一资源。失效 resourceId 必须显示恢复提示。
4. 填写阅读计划，在概念图添加个人边；在证据图添加主张、四类证据关系和草稿反链。参考文献可分批持续添加，不设总量上限。
5. 保存后重启服务并重新打开；三视图、投影与阅读状态应恢复。用另一个 owner 访问应为 404。
6. 断开 P04 或来源端口，界面必须显示“无历史记忆模式”或“显式降级”；事件端口拒绝反馈时必须提示未记录。

自动化对应：`workbench-context.test.ts`、`workbench-projection.test.ts`、`workbench-migration-deploy.test.ts`、`workbench-prisma-store.test.ts`。
