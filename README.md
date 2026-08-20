# Wormhole Library Agent

> 一个图书馆垂类 AI Agent：能找到你要的资源，也知道什么时候该带你去一个你从没想过要搜的书架、论文或人。

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:3000

Demo 查询：

```text
I want to learn AI Agent for a project
```

Demo 路径（3 分钟）：

1. 首页输入上面的查询 → 看到馆藏资源 + 阅读路径
2. Explore 页把意外度滑块拉到 70 → 打开知识虫洞（AI Agent → … → Mechanism Design）
3. 对虫洞点「🧮 太难了」→ 看到记忆更新提示
4. 打开 `/memory` → 数学容忍度已下降，有更新记录
5. `/memory` 页「重置 Demo 记忆」一键复位

> 骨架阶段整条链路由 in-memory fallback engine 驱动，**无需数据库**即可跑通。
> Prisma/SQLite 已就绪（`npm run db:push && npm run db:seed`），Day 2 接入队友模块后切换。

## 命令

```bash
npm run dev        # 开发服务器
npm run lint       # ESLint
npm run test       # Vitest（API contract + orchestrator smoke）
npm run build      # 生产构建
npm run db:push    # 建 SQLite 表
npm run db:seed    # 灌入 data/*.json seed
```

## 冻结的接口（v1.0 — 队友必读）

**唯一契约文件：`lib/types.ts`**。所有卡片结构（ResourceCard / WormholeCard / PersonMatchCard / LivingBookCard）、API 请求响应、模块接口签名都在这里。只允许加可选字段，禁止改名/删字段。

### API 路由（结构冻结）

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/search` | POST | 检索，返回 interactionId + 资源 + 阅读路径 |
| `/api/search?interactionId=` | GET | 取回已有检索（页面刷新用） |
| `/api/wormholes` | POST | 按滑块值生成虫洞 |
| `/api/feedback` | POST | 提交反馈，返回 memory patches |
| `/api/memory?userId=` | GET / DELETE | 读取 / 重置记忆 |
| `/api/matches` | POST | consent-safe 人物匹配 |
| `/api/contact-requests` | POST | 创建联系请求（mock，只存 pending） |

统一错误格式：`{ "error": { "code": "BAD_REQUEST" | "NOT_FOUND" | "CONSENT_REQUIRED" | "INTERNAL_ERROR", "message": "..." } }`

### 页面路由

`/` · `/explore/[interactionId]` · `/map/[interactionId]` · `/memory` · `/living-library`

## 队友接入指南

**原则：API route 只调 `lib/agent/orchestrator.ts`。接入 = 替换 orchestrator 里的 fallback 调用，UI 和 API 层不用动。**

在 `lib/agent/orchestrator.ts` 里搜索 `INTEGRATION POINT`：

| 标记 | 负责人 | 待接入模块 | 接口签名 |
|---|---|---|---|
| `[队友02]` | 队友02 | `lib/catalog/`（馆藏检索/排序） | `CatalogAdapter` |
| `[队友02]` | 队友02 | `lib/matching/livingLibrary.ts` + `consent.ts` | `LivingLibraryService` |
| `[队友03]` | 队友03 | `lib/concepts/conceptExtraction.ts` | `ConceptExtractor` |
| `[队友03]` | 队友03 | `lib/wormhole/`（生成+评分） | `WormholeEngine` |
| `[队友03]` | 队友03 | `lib/memory/compileFeedback.ts`（替换内部实现） | `MemoryCompiler` |

Seed 数据文件（结构冻结，直接扩充即可）：

| 文件 | 负责人 | 目标数量 |
|---|---|---|
| `data/seed-concepts.json` | 队友03 | 50+ 概念 |
| `data/seed-edges.json` | 队友03 | 80+ 边 |
| `data/seed-resources.json` | 队友02 | 30+ 资源 |
| `data/seed-living-books.json` | 队友02 | 6+ 人物（全部虚构） |

## 降级策略（不撒谎）

| 风险 | 降级方式 |
|---|---|
| 馆藏层未完成 | fallback seed catalog，UI 常显 "Demo catalog" 徽标 |
| 虫洞算法未完成 | fallback engine 走确定性图路径 + 设计文档评分公式，slider 仍影响排序 |
| 人物匹配未完成 | 只展示 Living Library 匿名卡，联系请求仅存 pending |
| LLM 不可用 | 全部走 deterministic provider（`lib/llm/provider.ts`） |

## 硬规则（Must not fake）

1. 反馈必须真实改变后续推荐（fallback 已实现）。
2. 滑块必须真实改变虫洞排序（fallback 已实现）。
3. 每个虫洞必须落在资源或 living book 上。
4. 人物匹配必须 opt-in；`consentState=private` 绝不返回；推荐卡永远匿名。
5. clean clone 必须能本地跑起来。

## 目录结构

```text
app/                    页面 + API routes
components/             ResourceCard / WormholeCard / SerendipitySlider / FeedbackBar / LivingBookCard
lib/
  types.ts              ★ 冻结契约（唯一事实来源）
  agent/orchestrator.ts ★ 集成核心（INTEGRATION POINT 都在这）
  mock/                 fallback engine + in-memory store（骨架期驱动全链路）
  catalog/ concepts/ wormhole/ matching/   队友模块目录（含接入说明）
  memory/compileFeedback.ts  Memory Compiler fallback 版
  validation/           zod schemas + 统一错误格式
  llm/ db/              provider 抽象 / Prisma client
prisma/                 schema + seed 脚本
data/                   seed JSON（队友直接扩充）
tests/unit/             API contract + orchestrator smoke
```
