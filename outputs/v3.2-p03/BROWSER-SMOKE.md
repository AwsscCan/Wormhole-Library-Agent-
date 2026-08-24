# 本地浏览器闭环验收

日期：2026-08-24  
页面：`http://localhost:3000/research`

1. 创建“RAG 检索质量验收”会话，页面进入 `/research/{sessionId}/map`。
2. 将主题个人标签改为“我的 RAG 评估主题”，写入注释，固定节点并保存；页面显示 `PRIVATE v1` 和“公共图哈希未变”。
3. 点击“查看主题馆藏”，页面显示 12 条真实 OpenAlex 馆藏结果；选择首条后按钮变为“已选择”，会话证据篮子写入资源 ID。
4. 点击“搜索此主题”，页面进入 `/explore/int_001?sessionId={sameSessionId}`，顶部返回链接指向同一会话地图。
5. 打开虫洞后返回研究地图；会话文件恢复出 1 次搜索、1 条证据、2 条虫洞记录，且保留个人标签、注释和固定状态。
6. 浏览器控制台无 error 日志。

自动化复现：`tests/unit/research-api-e2e.test.ts` 与 `tests/unit/research-workflow.test.ts`。
