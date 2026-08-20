# 责任包 01：你的任务包

角色：项目负责人 / 架构整合 / 主应用闭环 / Demo harness  
成员：  队友01
工作模式：你包含在三人之中，但主要负责整合统筹，不额外接手队友的核心算法或数据实验。

## 1. 主优化目标

把队友一的图书馆资源层、队友二的虫洞与记忆算法，整合成一个可运行、可演示、可验收的 Wormhole Library Agent。

你的核心成果不是“写最多代码”，而是让整个系统形成闭环：

```text
用户输入
  -> 图书馆 Agent 返回资源
  -> 用户调意外度滑块
  -> 系统生成知识虫洞
  -> 系统展示馆藏 / Living Library 落点
  -> 用户反馈
  -> 记忆更新
  -> 下一次推荐变化
```

## 2. 责任范围

你负责：

1. 初始化项目与 repo 结构。
2. 冻结 API 契约和 shared types。
3. 搭建 Next.js 页面骨架。
4. 搭建 Prisma schema 初版。
5. 整合队友一、队友二的模块。
6. 实现 Agent Orchestrator，把各工具串起来。
7. 维护 Demo seed 的版本。
8. 维护 README、Demo 脚本和验收清单。
9. 跑最终 lint、test、build。
10. 控制答辩故事线。

你不负责：

1. 替队友一补完整馆藏 seed 和资源排序实验。
2. 替队友二补虫洞算法、记忆编译和实验矩阵。
3. 最后一晚重写别人模块。
4. 把未完成模块伪装成完成。

## 3. 你必须冻结的接口

### 3.1 API 路由

```text
POST /api/search
POST /api/wormholes
POST /api/feedback
GET  /api/memory
POST /api/matches
POST /api/contact-requests
```

### 3.2 页面路由

```text
/
/explore/[interactionId]
/map/[interactionId]
/memory
/living-library
```

### 3.3 模块目录

```text
lib/agent/orchestrator.ts
lib/catalog/
lib/concepts/
lib/wormhole/
lib/memory/
lib/matching/
components/
prisma/
data/
tests/
```

## 4. 具体任务清单

### Day 1

1. 初始化 Next.js + TypeScript 项目。
2. 建立 `prisma/schema.prisma` 初版。
3. 建立 `data/` seed 文件结构。
4. 建立 shared types。
5. 建立 API route 空壳，但返回结构必须固定。
6. 建立首页和 Explore 页面基本布局。
7. 写 README 初版。

Day 1 验收：

```text
npm run dev 可以启动
首页可以输入问题
/api/search 返回 mock 但结构正确的数据
```

### Day 2

1. 接入队友一的 catalog/resource 模块。
2. 接入队友二的 wormhole/memory 模块。
3. 实现 `LibraryAgentOrchestrator`。
4. 把 slider 和 `/api/wormholes` 连接起来。
5. 把 feedback 和 `/api/feedback` 连接起来。
6. 在 Explore 页面显示记忆更新。

Day 2 验收：

```text
输入 AI Agent
  -> 能看到馆藏资源
  -> slider=70 能看到虫洞
  -> 提交反馈后 memory 页面有变化
```

### Day 3

1. 接入人物匹配和 Living Library 卡片。
2. 完成 KnowledgeMap 页面。
3. 跑完整 Demo。
4. 写 Playwright 或手工验收脚本。
5. 统一 UI 文案。
6. 准备答辩讲稿。
7. 冻结最终 seed。

Day 3 验收：

```text
npm run lint
npm run test
npm run build
Demo 3 分钟内可讲完
```

## 5. 独立技术决策

你需要自己决定：

1. 项目最终采用哪些 npm scripts。
2. shared types 放在哪里。
3. 页面数据是服务端拉取还是客户端拉取。
4. API 错误格式。
5. Demo reset 如何实现。
6. 如果队友模块未完成，如何降级但不撒谎。

推荐降级策略：

| 风险 | 降级方式 |
|---|---|
| 队友一资源层未完成 | 使用 seed fallback，但 UI 标注 Demo catalog |
| 队友二算法未完成 | 使用确定性模板路径，但保留 slider 排序差异 |
| 人物匹配未完成 | 展示 Living Library opt-in 卡，不展示联系请求 |
| LLM 不可用 | 全部走 deterministic provider |

## 6. 必做测试

你负责组织并跑通：

```bash
npm run lint
npm run test
npm run build
```

如果时间够：

```bash
npm run test:e2e
```

你自己至少写：

1. API contract 测试。
2. Orchestrator smoke test。
3. Demo flow 测试或手工验收记录。

## 7. 交付物

你最终提交：

1. 主 repo。
2. README。
3. Demo 脚本。
4. 接口说明。
5. 集成验收记录。
6. 最终运行命令。
7. 风险与降级说明。
8. 答辩稿。

## 8. 验收标准

通过标准：

1. 本地能跑。
2. 首页不是营销页，而是可直接使用的 Agent。
3. `/api/search`、`/api/wormholes`、`/api/feedback` 至少三条主链路打通。
4. 反馈后记忆变化可见。
5. Demo seed 一键重置。
6. 三分钟 Demo 不需要手动改数据库或临时刷新多次。

不通过标准：

1. 只有静态页面。
2. 需要人工复制 JSON 才能演示。
3. 队友模块无法接入且没有明确降级。
4. 文档写得很漂亮但 app 跑不起来。

