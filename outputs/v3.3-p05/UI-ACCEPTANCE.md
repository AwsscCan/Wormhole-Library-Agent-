# P05 可重复 UI 验收

验收夹具只在 `NODE_ENV !== production` 且 `P05_ACCEPTANCE_FIXTURE=1` 时启用；生产构建不会绑定模拟身份、目录、记忆或反馈端口。

## 1. 启动真实页面与 SQLite

在第一个 PowerShell 窗口运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-p05-ui-acceptance.ps1
```

在第二个 PowerShell 窗口创建带搜索、确认事实证据和虫洞的验收会话：

```powershell
$seed = Invoke-RestMethod -Method Post http://localhost:3000/api/research/acceptance/p05
$seed
"http://localhost:3000$($seed.workbenchHref)"
```

打开输出的工作台 URL。

## 2. 逐项点击

1. 选择“高”意外度并点击“生成探索项”：应得到 20 项，分档为 8 个 direct、7 个 adjacent、5 个 distant；页面显示来源为 `P05 acceptance fixture`，记忆显示已使用带来源特征。
2. 任取一项填写“个人标签”和“资源私有笔记”，加入阅读计划；用上移、下移、移除按钮检查建议顺序可编辑。
3. 打开“证据图”，添加主张并加入两项证据：第一项先填写私有笔记，第二项不填笔记。只勾选第一项，建立 supports/refutes/background/to_verify 任一关系并保存段落；该段落应只有一个 `workbench-note:*` 反链。再只勾选第二项保存另一段落；该段落应只有一个资源 ID 反链。这同时证明“仅使用显式勾选证据”，不是把全部证据塞进每个段落。
4. 点击资源 ID 反链：星图应居中并选中虚线标记的 `private suggestion`，且不得出现伪造的 `topic → resource` 概念边。点击“返回工作台证据/草稿”应回到相同 `sessionId` 和资源。
5. 点击 `workbench-note:*` 反链或资源卡的“笔记入口”：应回到同一资源的真实私有笔记编辑框；手动把 URL 中的 `noteId` 改成失效值时应显示恢复提示，而不是跳到概念图。
6. 点击资源卡的“继续搜索”，确认进入的检索页 URL 同时含原 `sessionId` 与新 `interactionId`。在星图点“查看主题馆藏”，响应提示应包含同一会话上下文；来源馆藏链接仍显示可追溯的原始来源 URL。
7. 点击“有用/太远/太难”之一，然后运行：

```powershell
Invoke-RestMethod http://localhost:3000/api/research/acceptance/p05 | ConvertTo-Json -Depth 8
```

应看到反馈事件，且事件中没有 preference 或 memory patch。
8. 保存工作台，停止并重新运行启动脚本，打开相同 URL；阅读计划、三种视图、标签、笔记、证据关系、草稿反链和资源投影应恢复。

验收结束后，如不再需要重启恢复样例，可在确认服务器已停止后删除测试库：

```powershell
Remove-Item -LiteralPath prisma/p05-ui-acceptance.db
```

## 3. 一键自动门禁

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-p05-acceptance.ps1
```

该命令依次执行 P05 定向测试、四组实验、全量回归、类型检查、lint、Prisma 校验、生产构建和补丁空白检查；任一步失败都会以非零状态停止。
