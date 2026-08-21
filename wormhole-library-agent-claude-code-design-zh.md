# Wormhole Library Agent — 论文虫洞功能工程设计文档

版本：2.0（基于 v1.3 重构，对齐七牛云主赛道 + 论文方向）
用途：直接喂给 Claude Code / 队友做 MVP 实现

---

## 0. 先说清楚：这个项目改了什么

v1.3 原版定位是"图书馆垂类 Agent"。我们讨论后决定改成**论文 Agent**，原因：

1. **七牛云赛道最贴**——赛题要求"反馈记忆 Agent + 真实场景"，论文研究就是真实场景，你的记忆引擎已经建好
2. **数据全免费**——OpenAlex + CrossRef 两个 API 验通了，论文搜索/引用/概念/摘要全包，不需要自建馆藏数据
3. **图书馆气质不对**——大工图书馆赛道要的是"空间级改造"，个人论文工具气质不符，硬贴会四不像

改动总结：

| v1.3 原版 | v2.0 改成 | 为什么 |
|---|---|---|
| 图书馆馆藏（自建 seed） | 论文检索（OpenAlex API） | 数据免费真实，不用自建 |
| Living Library（真人当活书） | **砍掉** | 社交匹配需网络效应，比赛做不出真 |
| 虫洞靠 NLP 语义相似度 | 虫洞靠 OpenAlex 概念标签集合运算 | 已验证，确定性算法，不需要 NLP |
| 记忆系统从零写 | 已有 Python 版（skill_extractor + memory_layers），TS 重写 or 包微服务 | 省 3-5 天 |
| 四赛道并列 | 七牛云为主，开放原子/奇绩创坛为加分 | 聚焦，别四不像 |
| 没有引用功能 | 新增：DOI → APA/MLA/国标格式 | 真痛点，奇绩创坛锚点 |
| 没有摘要功能 | 新增：论点/结论/引言提取 | demo 杀器 |

**主赛道**：七牛云——"具备反馈记忆能力的轻量 Agent 系统"
**加分赛道**：开放原子（虫洞=制造意外）、奇绩创坛（论文又臭又长=真痛点）
**不提**：大工图书馆（气质不符）

---

## 1. 运行形态

跟 v1.3 一样，Next.js 单体 Web 应用：

```
浏览器前端
  -> Next.js API Routes
  -> Paper Agent Orchestrator
  -> 工具函数 + 外部 API + 数据库
```

Agent 不是聊天机器人，是**工具编排器**：收到用户任务 → 规划 → 调工具 → 返回结果 → 收反馈 → 记忆更新 → 下次自动参考。

### 技术栈

| 层 | 选择 | 说明 |
|---|---|---|
| 前端 | Next.js App Router + React + TypeScript | 页面/API/逻辑放一个项目 |
| 后端 | Next.js API Routes | 不额外起 FastAPI |
| 数据库 | SQLite + Prisma | 本地演示稳定，后续可迁移 PostgreSQL |
| 外部 API | OpenAlex（主力）+ CrossRef（引用格式）| 全免费，不用 Key |
| LLM | Ollama 本地（可选）| 只增强摘要/综述，不承担核心排序 |
| 知识图谱 | OpenAlex concepts + 内存图搜索 | 不上 Neo4j |
| 可视化 | D3.js / Cytoscape.js | 引用关系地图 |
| 测试 | Vitest + Playwright | 算法单测 + Demo 链路验收 |

### 部署

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
# http://localhost:3000
```

不用装数据库、不用配 API Key、不用起 Ollama 也能跑通核心链路。

---

## 2. 赛道映射

### 主赛道：七牛云 — 具备反馈记忆能力的轻量 Agent 系统

赛题原文：用户输入任务 → Agent 规划+调用预置工具+生成结果 → 用户反馈 → 系统沉淀偏好/规则/经验 → 后续相似任务自动参考记忆。

考查点：记忆成本（token 费用、时间）、对话速度、记忆效果及是否准确使用。

**我们的答案**：

| 考查点 | 怎么解 |
|---|---|
| Agent 基础流程 | 用户输入 → orchestrator 规划 → 调用 paper_search / citation_format / paper_summarize 工具 → 返回结构化结果 |
| 记忆偏好记录 | 用户反馈 → compileFeedback 编译成偏好 patch → 存入 L1 常驻记忆 + L4 用户画像 |
| 后续任务参考 | 新请求进来 → 检索相关历史 → 注入可复用偏好/技能 → Agent 在结果中体现 |
| **记忆成本** | 论文搜索和引用格式走 API，**零 token 成本**；摘要用 OpenAlex 原文摘要兜底，Ollama 只在需要提取论点时调用 |
| **对话速度** | 核心链路全是 API + SQLite 查询，**毫秒级响应**；只有摘要提取走 LLM |
| **记忆效果** | /memory 页可视化展示偏好画像 + 更新历史；demo 里反馈后重新搜索，排序明显变化 |

**真实场景**：学术论文研究——每个研究生都在反复搜论文、筛选、读摘要、整理引用。这是真实的重复性任务，有真实的个性化需求（偏实证/偏理论、引用格式偏好）。

### 加分赛道：开放原子 — 制造一点意外

知识虫洞功能直接命中"不要继续猜用户下一步想要什么，试着创造一些他们自己都没想到会遇见的东西"。作为 Agent 的推荐策略之一展示，不是独立产品。

### 加分赛道：奇绩创坛 — 给现实打补丁

"论文又臭又长 + 引用格式折磨人"是任何人写过论文的人都能共情的真痛点。引用格式生成 + 论文摘要 = 给学术科研流程打的补丁。

---

## 3. 产品定义

PaperWorm 是 Wormhole 的论文虫洞功能模块——一个**会记住你的论文 Agent**。

Google Scholar 帮你搜论文，搜完就不管你了。这个模块会记住你的口味——你偏好实证还是理论、你喜欢 APA 还是国标、你觉得哪些方向太数学了——下次搜的时候自动帮你筛选排序。

具体来说它干这些事：

**Agent 调用的工具（预置能力）：**

1. **搜论文** — 关键词搜，返回列表 + 概念标签 + 被引数，按你的偏好排序
2. **读论文** — 论文太长？帮你提取论点、结论、引言核心
3. **生成引用** — 粘贴 DOI，APA / MLA / 国标格式自动生成，一键复制
4. **文献综述草稿** — 给 3-5 篇论文，生成一段综述段落

**反馈记忆怎么工作：**

- 你说"这篇太理论了，我要实证的" → 记住"偏好实证研究"
- 你说"用 APA 格式" → 下次自动默认 APA
- 你说"这个方向有趣但数学太难" → 记住"数学容忍度低"，下次推数学少的
- 下次搜论文 → 自动参考记忆，优先推符合你偏好的

**差异化加分——知识虫洞：**

Agent 偶尔从你读的论文出发，顺引用链拐 2-3 跳，推给你一篇不相关领域但思路能帮到你的论文。比如读 Transformer 论文 → 虫洞拐到 AlphaFold（蛋白质结构预测也用了注意力机制）。这不是随机推荐，是引用图谱 + 概念差异度的确定性路径。

### 目标用户

- 正在写课程论文的本科生
- 正在找研究方向的研究生
- 被引用格式折磨的人
- 想快速判断一篇论文值不值得读的人

---

## 4. 核心概念

### 4.1 论文搜索（paper_search）

调用 OpenAlex API 搜论文。返回标题、DOI、年份、作者、被引数、摘要、概念标签。按用户记忆中的偏好排序（偏实证/偏理论、中文优先/英文优先等）。

**数据来源已验证**：OpenAlex 免费，请求头加邮箱即可，限流宽松。

### 4.2 引用格式生成（citation_format）

粘贴 DOI → 调 CrossRef API 拿完整元数据 → 纯字符串模板拼成 APA / MLA / GB-T 7714 格式。不需要 AI，不需要 LLM。

**已验证**：DOI `10.1109/CVPR.2017.114` 查回完整作者/标题/年份/期刊/卷期页，手动拼出 APA 和国标格式。

### 4.3 论文摘要提取（paper_summarize）

OpenAlex 的 `abstract_inverted_index` 字段可以重建完整摘要。Ollama 负责从摘要中提取"核心论点 / 主要结论 / 引言背景"三段。Ollama 挂了就用 OpenAlex 原文摘要，标"原文摘要，未提取论点"。

### 4.4 反馈记忆（feedback_memory）

用户反馈不只是存聊天记录，是编译成结构化偏好：

```
用户反馈："这个方向很有趣，但数学太难了"
  ↓ compileFeedback 编译成 patch
  ↓
{
  "serendipity.likedDomains": ["Economics"],   // 喜欢经济学方向
  "difficulty.mathTolerance": 0.38,             // 数学容忍度下降
  "reading.summaryFirst": true                  // 摘要优先展示
}
  ↓
下次搜论文 → 排序逻辑参考这些偏好 → 数学重的论文排名下降
```

**已有 Python 实现**：`skill_extractor.py`（技能提炼）+ `memory_layers.py`（L1 常驻 + L2 SQLite 检索 + L4 画像），已通过端到端闭环测试。搬到 Web 版有两条路（见 Section 13）。

### 4.5 知识虫洞（wormhole_suggest）— 加分项

从用户读的论文出发，顺引用链拐 2-3 跳，推一篇概念差异度高的论文。

**已验证算法**（不需要 NLP，集合运算）：

1. OpenAlex 给每篇论文标了 10+ 个概念，每个带分数
2. 用户读论文 A（概念：Transformer / 机器翻译 / BLEU）
3. A 引用了 B，查 B 的概念（语料库语言学 / 语言学 / 哲学）
4. A 和 B 的概念重叠很少 → 差异度 ≈ 60% → B 就是虫洞目的地
5. 滑块控制差异度阈值：滑块低推高重叠的，滑块高推跨领域的

**实测案例**：读 "Attention Is All You Need" → 虫洞拐到 "Penn Treebank"（1993 年语料库语言学）。更强的：引用 Transformer 的第一篇是 AlphaFold——从 AI 拐到生物。

### 4.6 Serendipity Slider（意外度滑块）— 加分项

用户控制今天想离知识舒适区多远：

| 区间 | 含义 |
|---|---|
| 0-20 | 附近书架：同领域新论文 |
| 21-40 | 隔壁书架：相邻领域 |
| 41-60 | 跨过楼层：明显跨学科 |
| 61-80 | 另一栋楼：较远但有清晰桥梁 |
| 81-100 | 深空探索：高意外度但仍不随机 |

滑块必须真实参与虫洞排序。

---

## 5. 用户流程

### 5.1 第一次使用

```
用户打开首页
  -> 输入："我想找几篇 AI Agent 在科研中应用的论文"
  -> Agent 调用 paper_search（OpenAlex）
  -> 返回论文列表，每篇带摘要 + 概念标签 + 被引数
  -> 用户对一条结果点"太理论了"
  -> 系统记住"偏好实证研究"
```

### 5.2 第二次使用（记忆生效）

```
用户输入："帮我找 Agent Memory 的论文"
  -> 系统读取记忆：偏好实证、中文优先、数学容忍度低
  -> paper_search 返回结果时自动按偏好排序
  -> 实证类论文排在前面，纯理论的沉到后面
  -> 系统主动给一条虫洞：Agent Memory → Human Memory → Cognitive Psychology
```

### 5.3 引用格式流程

```
用户在论文详情页点"生成引用"
  -> 粘贴 DOI: 10.1109/CVPR.2017.114
  -> 系统调 CrossRef API 拿元数据
  -> 选择格式：APA / MLA / GB-T 7714
  -> 一键复制
  -> 用户说"以后都用 APA"
  -> 系统记住默认格式
```

---

## 6. MVP 边界

### 6.1 必须实现（七牛云赛道答辩核心）

| 功能 | 说明 | 数据来源 | 用 LLM |
|---|---|---|---|
| **论文搜索** | 关键词搜，返回列表+摘要+概念，按偏好排序 | OpenAlex API | 不用 |
| **引用格式** | DOI → APA/MLA/国标，一键复制 | CrossRef API + 模板 | 不用 |
| **反馈记忆** | 反馈 → 存偏好 → 下次自动参考排序 | 本地 SQLite + 文件 | 不用 |

### 6.2 展示能力（让 Agent 看起来更聪明）

| 功能 | 说明 | 数据来源 | 用 LLM |
|---|---|---|---|
| **论文摘要** | 提取论点/结论/引言 | OpenAlex 摘要 + Ollama | 是（可降级）|
| **文献综述** | 给 3-5 篇论文 → 生成综述段落 | 多篇摘要 + Ollama | 是 |
| **引用关系地图** | 一篇论文的引用网络可视化 | OpenAlex + D3 | 不用 |
| **阅读缺口分析** | "你读了 ABC，但该读 D" | 引用图谱差集 | 不用 |

### 6.3 差异化加分项

| 功能 | 说明 | 赛道 |
|---|---|---|
| **知识虫洞** | 引用 2-3 跳 + 概念差异度 | 开放原子 |
| **站内推送** | 定时推荐 + 偶尔一条虫洞 | 七牛云（记忆被持续使用）|

### 6.4 不做

- ~~Living Library（真人当活书）~~ — 社交匹配需网络效应，砍掉
- ~~Knowledge Collision（人物碰撞）~~ — 依赖 Living Library，一起砍
- ~~AR 找书~~
- ~~真实消息推送系统~~ — 降级为站内通知
- ~~Neo4j / Qdrant~~
- ~~真实用户登录系统~~

---

## 7. 系统架构

```
用户浏览器
  |
  v
Next.js API Routes (7个接口)
  |
  v
orchestrator.ts (唯一接线员)
  |
  +-> paper_search() -----> OpenAlex API
  +-> citation_format() --> CrossRef API
  +-> paper_summarize() --> OpenAlex + Ollama
  +-> wormhole_suggest() -> OpenAlex (references + concepts)
  +-> compileFeedback() -> 记忆引擎 (SQLite + 文件)
  +-> getMemory() -------> 记忆引擎
  +-> buildInjection() --> 记忆引擎
```

核心原则：
- 排序和路径生成必须是确定性代码
- LLM 只负责润色摘要文本，不负责核心排序
- 没有 LLM/Ollama 时，Demo 仍然完整可运行（OpenAlex 自带摘要）
- 所有工具必须有类型定义和测试

---

## 8. 工具设计

| 工具 | 作用 | MVP 要求 | 数据来源 |
|---|---|---|---|
| `paper_search` | 关键词搜论文 | 必须返回论文卡（标题/摘要/概念/被引数）| OpenAlex |
| `citation_format` | DOI → 引用格式 | 必须 APA/MLA/GB-T 三种 | CrossRef + 模板 |
| `paper_summarize` | 提取论点/结论/引言 | Ollama 挂了走 OpenAlex 原文 | OpenAlex + Ollama |
| `compileFeedback` | 反馈 → 记忆 patch | 必须改变后续排序 | 本地 |
| `getMemory` | 读取用户偏好 | 返回结构化偏好 | 本地 |
| `buildInjection` | 偏好注入到搜索结果 | 搜索结果按偏好重排 | 本地 |
| `wormhole_suggest` | 引用 2-3 跳 + 概念差异度 | 滑块影响结果 | OpenAlex |
| `findUnknownUnknowns` | 找用户没搜过但相关的领域 | 基于 novelty + bridge | OpenAlex |
| `generateReview` | 给多篇论文生成综述段落 | Ollama 挂了走拼接 | 多篇摘要 + Ollama |

---

## 9. 数据模型

### 9.1 Paper（论文）

```typescript
type Paper = {
  id: string;              // OpenAlex ID
  doi: string | null;
  title: string;
  authors: Author[];
  year: number;
  venue: string | null;     // 期刊/会议
  citedByCount: number;
  abstract: string | null;  // 从 inverted_index 重建
  concepts: ConceptTag[];   // OpenAlex 概念标签
  openAccess: boolean;
  openAccessPdf: string | null;
};

type Author = {
  name: string;
  orcid: string | null;
  institution: string | null;
};

type ConceptTag = {
  id: string;              // OpenAlex concept ID
  name: string;
  score: number;           // 0-1 相关度
  level: number;           // 0=大类 4=细类
};
```

### 9.2 CitationFormat（引用格式）

```typescript
type CitationFormat = {
  doi: string;
  style: "apa" | "mla" | "gbt7714" | "chicago";
  text: string;            // 拼好的引用文本
  source: "crossref" | "manual";
};

type CitationMetadata = {
  doi: string;
  title: string;
  authors: { family: string; given: string }[];
  year: number;
  containerTitle: string;   // 期刊名/会议名
  volume: string | null;
  issue: string | null;
  page: string | null;
  publisher: string | null;
  type: string;             // "journal-article" | "proceedings-article" | ...
};
```

### 9.3 UserMemory（用户记忆）

```typescript
type UserMemory = {
  userId: string;
  category: "reading" | "difficulty" | "citation" | "serendipity" | "task";
  key: string;              // 如 "reading.languagePref"
  value: unknown;           // 如 "zh_first"
  confidence: number;       // 0-1
  source: "explicit_feedback" | "implicit_click" | "system_inferred";
  useCount: number;
  updatedAt: string;
};
```

记忆示例：
```json
{
  "reading": {
    "languagePref": "zh_first",
    "summaryFirst": true,
    "resultCount": 5
  },
  "difficulty": {
    "preferredLevel": "undergrad",
    "mathTolerance": 0.42
  },
  "citation": {
    "defaultStyle": "apa"
  },
  "serendipity": {
    "defaultSlider": 60,
    "likedDomains": ["Cognitive Science", "Economics"],
    "dislikedDomains": ["Pure Mathematics"]
  }
}
```

### 9.4 WormholePath（虫洞路径）

```typescript
type WormholePath = {
  id: string;
  startPaperId: string;
  startConcepts: ConceptTag[];
  bridgePapers: Paper[];     // 2-3 跳中间论文
  targetPaperId: string;
  targetConcepts: ConceptTag[];
  explanation: string;       // 人话解释为什么拐到这里
  scores: {
    novelty: number;          // 概念差异度 0-1
    bridge: number;           // 路径强度 0-1
    quality: number;          // 目标论文质量 0-1
    final: number;            // 加权总分
  };
};
```

### 9.5 Interaction（交互记录）

```typescript
type Interaction = {
  id: string;
  userId: string;
  query: string;
  resultPaperIds: string[];
  feedback: Feedback | null;
  memoryUsed: string[];     // 这次用到了哪些记忆
  createdAt: string;
};

type Feedback = {
  targetType: "paper" | "wormhole" | "citation";
  targetId: string;
  rating: "too_theoretical" | "too_empirical" | "too_hard" | "just_right" | "interesting";
  freeText: string | null;
};
```

---

## 10. 虫洞算法（已验证可行）

### 10.1 数据基础

OpenAlex 给每篇论文标了 10+ 个概念标签，每个带 score（0-1）和 level（0=大类 4=细类）。这些标签是现成的，不需要自己做 NLP 概念抽取。

### 10.2 Novelty（概念差异度）

```
concepts_A = 用户当前论文的概念集合
concepts_B = 候选虫洞论文的概念集合

# 去掉大类（level=0）的干扰，只比 level >= 1 的概念
concepts_A_filtered = {c.name for c in concepts_A if c.level >= 1 and c.score > 0.3}
concepts_B_filtered = {c.name for c in concepts_B if c.level >= 1 and c.score > 0.3}

overlap = concepts_A_filtered ∩ concepts_B_filtered
only_B = concepts_B_filtered - concepts_A_filtered

novelty = len(only_B) / len(concepts_B_filtered)   # B 独有概念占比
```

实测：Attention Is All You Need（机器翻译）→ Penn Treebank（语料库语言学），novelty ≈ 0.60。

### 10.3 NoveltyFit（滑块适配度）

```
target_novelty = slider_value / 100
novelty_fit = 1 - abs(novelty - target_novelty)
```

滑块 70 → target_novelty = 0.70 → 推 novelty 接近 0.70 的论文。
滑块 20 → target_novelty = 0.20 → 推高重叠的论文。

### 10.4 BridgeScore（路径强度）

```
# 从 A 到 B 找引用路径（1-3 跳）
path_strength = average(edge.weight for edge in path)
path_explainability = 1 - ((path_length - 2)^2 / 4)   # 2 跳最优，过长扣分
bridge_score = 0.65 * path_strength + 0.35 * path_explainability
```

淘汰规则：
- bridge_score < 0.35 的候选直接丢弃
- 没有论文落点的候选直接丢弃

### 10.5 QualityScore（目标论文质量）

```
quality_score =
  0.45 * normalized_cited_by_count    # 被引数归一化
  + 0.25 * open_access ? 1 : 0.5      # 开放获取加分
  + 0.20 * has_abstract ? 1 : 0.3     # 有摘要加分
  + 0.10 * difficulty_match           # 难度匹配用户
```

### 10.6 FinalScore

```
final_score =
  0.40 * bridge_score
  + 0.30 * novelty_fit
  + 0.20 * quality_score
  + 0.10 * diversity_score          # 与已推荐虫洞的多样性
```

### 10.7 记忆修正

```
if target_domain in memory.likedDomains:     final_score += 0.05
if target_domain in memory.dislikedDomains:  final_score -= 0.08
if target_needs_high_math and mathTolerance < 0.4:  final_score -= 0.10
if memory.languagePref == "zh_first" and paper.is_chinese:  final_score += 0.04
```

---

## 11. 反馈记忆引擎 — 七牛云赛道核心

### 11.1 已建好的 Python 实现

| 组件 | 文件 | 干什么 |
|---|---|---|
| 技能提炼 | `skill_extractor.py` | 多步任务完成 → 自动提炼成可复用技能；同义说法下次命中 → 自动注入 → uses+1 |
| 分层记忆 | `memory_layers.py` | L1 常驻记忆（200 行去重）/ L2 会话归档（SQLite，token 检索 + 命中数排序）/ L4 用户画像 |
| Agent 大脑 | `agent_brain.py` | get_system_prompt() 注入 7 个上下文：状态+记忆+任务+摘要+技能+画像+历史 |

已通过端到端闭环测试：多步任务完成 → 技能提炼 → 同义说法命中 → uses 递增 → 无关请求不误命中 → L2 历史检索命中。

### 11.2 怎么搬到 Web 版

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **路 A（推荐）** | 用 TypeScript 重写记忆引擎 | clean clone 体验好，npm install 就能跑 | 多 2-3 天工作量 |
| **路 B** | Python 记忆引擎包 FastAPI 微服务 | 零重写，直接用测通代码 | 队友要装 Python + 依赖 |

### 11.3 Memory Compiler

把自然语言反馈变成结构化 patch：

```
反馈："这个方向很有趣，但数学太重"
  ↓
[
  {
    "key": "serendipity.likedDomains",
    "operation": "add_or_increment",
    "value": "Economics",
    "confidenceDelta": 0.08
  },
  {
    "key": "difficulty.mathTolerance",
    "operation": "decrement",
    "value": 0.08,
    "confidenceDelta": 0.10
  }
]
```

### 11.4 记忆如何影响排序

```typescript
function rankWithMemory(papers: Paper[], memory: UserMemory): Paper[] {
  return papers.map(p => {
    let score = p.citedByCount;  // 基础分=被引数

    // 语言偏好
    if (memory.reading?.languagePref === "zh_first" && p.isChinese)
      score *= 1.15;

    // 难度偏好
    if (memory.difficulty?.mathTolerance < 0.4 && p.concepts.some(c => c.name === "Mathematics"))
      score *= 0.7;

    // 喜欢的领域加分
    if (p.concepts.some(c => memory.serendipity?.likedDomains?.includes(c.name)))
      score *= 1.1;

    return { ...p, _rankScore: score };
  }).sort((a, b) => b._rankScore - a._rankScore);
}
```

### 11.5 记忆预算（七牛云考查点）

每次 Agent 调用最多注入：
- 12 条记忆
- 1200 字符以内

记忆选择公式：
```
memory_relevance =
  0.45 * 任务匹配度
  + 0.25 * 置信度
  + 0.15 * 新近程度
  + 0.15 * 历史成功率
```

### 11.6 记忆成本分析

| 操作 | 用不用 LLM | token 成本 | 耗时 |
|---|---|---|---|
| 论文搜索 | 不用 | 0 | ~200ms（OpenAlex API）|
| 引用格式 | 不用 | 0 | ~100ms（CrossRef API + 模板）|
| 记忆检索（L2）| 不用 | 0 | ~5ms（SQLite LIKE）|
| 技能注入 | 不用 | 0 | ~1ms（文件读取）|
| 论文摘要提取 | 用 Ollama | 低（分块）| ~3-5s |
| 文献综述 | 用 Ollama | 中（多篇）| ~5-10s |

**核心链路（搜索+引用+记忆）全是不用 LLM 的——记忆系统本身不烧 token。这是对比其他参赛队伍最大的优势。**

---

## 12. 数据来源 — 全免费，不用 API Key

### OpenAlex（主力数据源）

论文界的 Wikipedia，完全免费，请求头加邮箱就行。

- **搜论文** — 关键词搜，返回标题/DOI/年份/作者/被引数/摘要/概念标签/开放获取状态
- **论文摘要** — `abstract_inverted_index` 字段，倒排索引还原就是完整摘要
- **概念标签** — 每篇论文自动标 10+ 个概念，带 score 和 level
- **引用关系** — `referenced_works`（它引用了谁）+ `filter=cites:W...`（谁引用了它）

实测：搜 "Attention Is All You Need" → 28 篇引用文献 + 6688 篇被引文献 + 10 个概念标签 + 完整摘要。

### CrossRef（引用格式专用）

DOI 的官方注册机构。给一个 DOI 返回完整书目信息：作者（姓+名分开）、标题、年份、期刊、卷号、期号、页码、论文类型。纯模板拼成 APA/MLA/国标。

实测：DOI `10.1109/CVPR.2017.114` → 完整元数据 → 手动拼出 APA 和国标格式。

### Semantic Scholar（备用，可不用）

也有论文搜索和引用图谱，但无 Key 时频繁 429 限流。OpenAlex 覆盖了大部分功能。**可以完全不用。**

### 限流对策

| API | 风险 | 对策 |
|---|---|---|
| OpenAlex | 低 | User-Agent 带 mailto 即可 |
| CrossRef | 低 | User-Agent 带 mailto 即可 |
| Semantic Scholar | 高 | 申请免费 Key 或完全不用 |

---

## 13. 降级策略（缺什么都能跑，不骗人）

| 如果这个没做完 | 系统怎么办 | 给用户看到什么 |
|---|---|---|
| OpenAlex 限流了 | 走本地缓存 seed 数据 | 标"离线缓存"徽标 |
| CrossRef 挂了 | 让用户手动填元数据 | 标"手动模式" |
| Ollama 挂了 | 摘要用 OpenAlex 原文摘要 | 标"原文摘要，未提取论点" |
| 虫洞算法没写完 | 走引用图谱确定性路径（2 跳），滑块照样影响排序 | 用户无感知 |
| 引用地图没画 | 只展示论文列表 | 隐藏地图入口 |
| 推送没做 | 降级为站内通知 | "站内推送" |
| 记忆引擎没搬完 | 用简化版（SQLite key-value 存偏好）| 功能降级但闭环 |

**关键**：论文搜索、引用格式、记忆引擎这三个核心功能几乎不存在"做不出真"的风险——OpenAlex 和 CrossRef 是免费 API，记忆引擎已建好测通。

---

## 14. 隐私与安全

- Demo seed 数据使用虚构论文和虚构用户
- 不收集真实个人隐私
- 用户可以查看和重置记忆
- /memory 页提供"重置 Demo 记忆"按钮
- ~~Living Library 隐私流程~~ — 已砍，不做社交匹配

---

## 15. API 设计

### 15.1 搜索

```
POST /api/search

请求：
{
  "userId": "demo-user",
  "query": "帮我找几篇 AI Agent 在科研中应用的论文",
  "taskType": "project",       // project | research | coursework | exam
  "level": "beginner",          // beginner | undergrad | graduate | research
  "sliderValue": 60             // 虫洞意外度（可选，默认读记忆）
}

响应：
{
  "interactionId": "int_001",
  "papers": [
    {
      "id": "W1234",
      "title": "...",
      "doi": "10.xxx/xxx",
      "year": 2024,
      "authors": [...],
      "citedByCount": 42,
      "abstract": "...",
      "concepts": [{"name": "AI Agent", "score": 0.92}, ...],
      "openAccess": true
    }
  ],
  "readingPath": ["AI Agent", "Planning", "Tool Use", "Memory"],
  "memoryUsed": ["偏好实证研究", "中文优先"],
  "interactionId": "int_001"
}
```

### 15.2 论文摘要

```
POST /api/summarize

请求：
{
  "paperId": "W1234",           // OpenAlex ID
  "userId": "demo-user"
}

响应：
{
  "paperId": "W1234",
  "abstract": "...",            // OpenAlex 原文摘要
  "keyArgument": "...",         // Ollama 提取的核心论点
  "mainConclusion": "...",      // Ollama 提取的主要结论
  "introContext": "...",        // Ollama 提取的引言背景
  "source": "ollama"            // ollama | openalex_only | cached
}
```

### 15.3 引用格式

```
POST /api/citation

请求：
{
  "doi": "10.1109/CVPR.2017.114",
  "style": "apa"                // apa | mla | gbt7714 | chicago
}

响应：
{
  "doi": "10.1109/CVPR.2017.114",
  "style": "apa",
  "text": "Vaswani, A., Shazeer, N., ... (2017). Attention Is All You Need. Advances in Neural Information Processing Systems. https://doi.org/10.1109/CVPR.2017.114",
  "metadata": {
    "title": "Attention Is All You Need",
    "authors": [...],
    "year": 2017,
    "container": "Advances in Neural Information Processing Systems",
    "volume": null,
    "page": "1013-1021"
  },
  "source": "crossref"
}
```

### 15.4 提交反馈

```
POST /api/feedback

请求：
{
  "userId": "demo-user",
  "interactionId": "int_001",
  "targetType": "paper",
  "targetId": "W1234",
  "rating": "too_theoretical",
  "freeText": "这篇太理论了，我要实证的"
}

响应：
{
  "memoryPatches": [
    {"key": "reading.prefEmpirical", "operation": "set", "value": true},
    {"key": "difficulty.theoryTolerance", "operation": "decrement", "value": 0.1}
  ],
  "memoryUpdated": true
}
```

### 15.5 生成虫洞

```
POST /api/wormholes

请求：
{
  "userId": "demo-user",
  "interactionId": "int_001",
  "startPaperId": "W1234",
  "sliderValue": 70,
  "maxPaths": 3
}

响应：
{
  "wormholes": [
    {
      "id": "wh_001",
      "path": ["W1234", "W5678", "W9012"],
      "startConcepts": ["AI Agent", "Planning"],
      "targetConcepts": ["Mechanism Design", "Game Theory"],
      "targetPaper": {
        "id": "W9012",
        "title": "...",
        "doi": "...",
        "year": 1994,
        "citedByCount": 5000
      },
      "explanation": "从 AI Agent 出发，Multi-Agent Coordination 研究多个主体如何协作，这跟机制设计研究多个主体如何在规则下行动有直接桥梁。",
      "scores": {
        "novelty": 0.68,
        "bridge": 0.72,
        "quality": 0.85,
        "final": 0.74
      }
    }
  ]
}
```

### 15.6 查询/重置记忆

```
GET /api/memory?userId=demo-user

响应：
{
  "userId": "demo-user",
  "memory": {
    "reading": {"languagePref": "zh_first", "summaryFirst": true},
    "difficulty": {"mathTolerance": 0.42, "preferredLevel": "undergrad"},
    "citation": {"defaultStyle": "apa"},
    "serendipity": {"defaultSlider": 60, "likedDomains": ["Cognitive Science"]}
  },
  "history": [
    {"timestamp": "2026-08-20T10:00:00Z", "action": "feedback", "detail": "偏好实证研究", "patches": [...]},
    {"timestamp": "2026-08-20T10:05:00Z", "action": "feedback", "detail": "数学容忍度下降", "patches": [...]}
  ]
}

DELETE /api/memory?userId=demo-user
-> 重置所有记忆到初始状态
```

### 15.7 文献综述

```
POST /api/review

请求：
{
  "userId": "demo-user",
  "paperIds": ["r_aima", "r_multiagent_systems", "r_game_theory_intro"], // Demo 为 3-5 条馆藏 ID；接 OpenAlex 后映射为论文 ID
  "focus": "methods"                           // 可选：methods | findings | timeline
}

响应：
{
  "reviewText": "...",                         // 综述段落
  "papersUsed": ["W1234", "W5678", "W9012"],
  "source": "ollama"                           // ollama | concat（Ollama 挂了走摘要拼接）
}
```

实现状态（2026-08-21）：`/api/review` 与 `/review` 工作台已接入。当前默认 provider 不可用时返回 `source: "concat"`，页面必须显示「摘要拼接模式」，不得标作 LLM 生成。

### 统一错误格式

```json
{
  "error": {
    "code": "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_ERROR",
    "message": "..."
  }
}
```

---

## 16. 数据库 Schema

Prisma schema 需要以下模型：

```prisma
model User {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  memories  UserMemory[]
  interactions Interaction[]
}

model Paper {
  id            String   @id        // OpenAlex ID
  doi           String?
  title         String
  year          Int?
  venue         String?
  citedByCount  Int      @default(0)
  abstract      String?  // 重建后的文本
  concepts      Json?    // ConceptTag[]
  openAccess    Boolean  @default(false)
  createdAt     DateTime @default(now())
  interactions  Interaction[]
}

model UserMemory {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  category  String   // reading | difficulty | citation | serendipity | task
  key       String
  value     Json
  confidence Float   @default(0.5)
  source    String   @default("explicit_feedback")
  useCount  Int      @default(0)
  updatedAt DateTime @updatedAt
}

model Interaction {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  query        String
  resultPaperIds Json   // string[]
  feedback     Json?    // Feedback
  memoryUsed   Json?    // string[]
  createdAt    DateTime @default(now())
}

model Feedback {
  id              String   @id @default(cuid())
  interactionId   String
  targetType      String   // paper | wormhole | citation
  targetId        String
  rating          String   // too_theoretical | too_hard | just_right | interesting
  freeText        String?
  memoryPatches   Json?
  createdAt       DateTime @default(now())
}

model WormholeRun {
  id              String   @id @default(cuid())
  userId          String
  interactionId   String
  startPaperId    String
  sliderValue     Int
  paths           Json     // WormholePath[]
  createdAt       DateTime @default(now())
}
```

---

## 17. 前端页面

### 17.1 `/` — 首页

搜索框 + 论文列表 + 反馈条。第一屏必须能直接用。

必须包含：
- 主输入框（输入你想研究什么）
- 任务类型选择（课程论文/科研项目/考试复习/项目开发）
- 难度选择（入门/本科/研究生/科研）
- Demo 示例文字
- 搜索结果论文卡片列表

### 17.2 `/paper/[id]` — 论文详情

必须包含：
- 论文标题/作者/年份/被引数
- 摘要（原文 + Ollama 提取的论点/结论/引言）
- 概念标签列表（可点击按概念筛论文）
- 引用格式生成器（粘 DOI → 选格式 → 一键复制）
- "试试知识虫洞"按钮
- 反馈条（太理论/太实证/正好/太难）

### 17.3 `/explore/[interactionId]` — 虫洞探索

必须包含：
- 意外度滑块（0-100）
- 虫洞卡片列表（起点→路径→终点 + 解释 + 分数）
- 反馈按钮（有趣但太难 / 正好 / 不相关）
- 反馈后记忆更新提示

### 17.4 `/memory` — 记忆透明页（七牛云核心展示）

必须包含：
- 当前偏好画像（语言/难度/引用格式/虫洞偏好）
- 最近记忆更新历史（时间线）
- "重置 Demo 记忆"按钮
- 默认意外度调整

### 17.5 `/map/[interactionId]` — 引用关系地图（加分项）

展示一篇论文的引用网络：当前论文 → 引用的论文 → 被引的论文，用 D3/Cytoscape 画可拖拽图。

### 17.6 `/review` — 文献综述生成器（加分项）

输入 3-5 篇论文 → Ollama 生成一段综述段落。

### 17.7 页面 ↔ API 调用映射（前端接线总表）

| 页面 | 接口 | 方法 | 触发时机 | 说明 |
|---|---|---|---|---|
| `/` | `/api/search` | POST | 提交搜索 | 返回论文列表 + memoryUsed |
| `/` | `/api/memory` | GET | 首次加载 | 预填任务类型/难度/滑块默认值（来自记忆） |
| `/paper/[id]` | `/api/summarize` | POST | 进入页面 | 摘要 + 论点/结论/引言 |
| `/paper/[id]` | `/api/citation` | POST | 点"生成引用" | DOI 已知（来自搜索结果），不用手粘 |
| `/paper/[id]` | `/api/feedback` | POST | 点反馈条 | `targetType: "paper"` |
| `/paper/[id]` | 跳转 `/explore/[interactionId]` | — | 点"试试知识虫洞" | URL 带 `startPaperId` |
| `/explore/[interactionId]` | `/api/wormholes` | POST | 滑块变化（防抖 300ms） | sliderValue 实时重排虫洞 |
| `/explore/[interactionId]` | `/api/feedback` | POST | 点反馈按钮 | `targetType: "wormhole"` |
| `/memory` | `/api/memory` | GET | 进入页面 | 偏好画像 + 更新历史 |
| `/memory` | `/api/memory` | DELETE | 点"重置"（确认弹窗后） | 记忆归零并刷新 |
| `/review` | `/api/review` | POST | 点"生成综述" | 传 3-5 篇 paperIds |
| `/map/[interactionId]` | 复用 `/api/wormholes` 响应 | — | 进入页面 | D3 图数据来自 path + bridgePapers，不另开接口 |

**前端数据流约定**：
- 页面级状态走 URL（`interactionId`、`startPaperId` 在 URL 里，刷新不丢）
- 不引 Redux/全局 store——React `useState` + props 传递够了，接口一共 7 个
- 交互后需要刷新记忆的，直接再 GET `/api/memory`，不做本地乐观同步

### 17.8 UI 状态规范（每个数据页面统一遵守）

| 状态 | 展示 | 禁止 |
|---|---|---|
| loading | 骨架屏（论文卡/虫洞卡形状的占位块） | 白屏、转圈遮全页 |
| error | 错误文案 + 重试按钮 | 静默失败、白屏 |
| empty | 引导文案 + 可点击的 Demo 示例输入 | 空白页 |
| fallback | **徽标常显**："离线缓存" / "手动模式" / "原文摘要" / "拼接模式" | 降级了但不告诉用户 |
| feedback 提交 | 按钮立即变灰 + "已记录到记忆" toast | 等 API 响应才给反馈感 |

fallback 徽标判定规则：响应里 `source` 字段不等于正常值（`crossref`/`ollama`）就必须显示对应徽标。这条对应第 25 节硬规矩第 9 条。

---

## 18. 组件设计

| 组件 | 是什么 | 关键交互 |
|---|---|---|
| `PaperCard` | 论文卡片：标题/摘要/概念标签/被引数 | 概念标签可点筛选 |
| `FeedbackBar` | 反馈条：「太理论」「太实证」「正好」「太难」 | **七牛云赛道心脏**——点击必须改变下次排序 |
| `CitationFormatter` | 引用格式：DOI 输入 → 格式选择 → 一键复制 | 记住上次选择的格式 |
| `WormholeCard` | 虫洞卡片：起点→路径→终点 + 解释 + 分数 | 展示"为什么拐到这里" |
| `SerendipitySlider` | 意外度滑块：0-100 | 实时改变虫洞排序 |
| `MemoryPanel` | 记忆画像 + 更新历史 | 七牛云核心展示 |
| `ConceptTags` | 概念标签列表 | 可点击按概念筛选 |
| `KnowledgeMap` | 引用关系网络图（D3/Cytoscape）| 可拖拽节点 |

### 组件 Props 契约（与 types.ts 同步冻结）

```typescript
// 所有类型从 lib/types.ts 导入，组件不得自定义重复类型

PaperCardProps = {
  paper: PaperCard;
  onFeedback: (rating: Feedback["rating"]) => void;
  onConceptClick: (concept: ConceptTag) => void;
}

FeedbackBarProps = {
  targetType: Feedback["targetType"];
  targetId: string;
  disabled?: boolean;                          // 提交后置灰
  onSubmitted: (patches: MemoryPatch[]) => void; // 供父组件 toast "已记录到记忆"
}

CitationFormatterProps = {
  doi: string | null;                          // null 时显示 DOI 输入框
  defaultStyle: CitationResult["style"];       // 记忆里的默认格式
  onCopied: (text: string) => void;            // 复制成功 toast
}

WormholeCardProps = {
  wormhole: WormholeCard;
  onFeedback: (rating: Feedback["rating"]) => void;
}

SerendipitySliderProps = {
  value: number;                               // 0-100
  onChange: (v: number) => void;               // 父组件防抖 300ms 再调 /api/wormholes
}

MemoryPanelProps = {
  memory: Record<string, unknown>;             // GET /api/memory 的 memory 字段
  history: { timestamp: string; action: string; detail: string; patches?: MemoryPatch[] }[];
  onReset: () => void;                         // 内部做确认弹窗
}

ConceptTagsProps = {
  concepts: ConceptTag[];
  onSelect: (conceptName: string) => void;     // 触发按概念重新搜索
}

KnowledgeMapProps = {
  path: PaperId[];                             // 虫洞路径 A -> B -> C
  papers: Record<PaperId, PaperCard>;          // 节点数据，来自 /api/wormholes 响应
}
```

---

## 19. Repo 结构

```text
wormhole-library-agent/
  app/
    page.tsx                        # 首页：搜索框 + 论文列表
    paper/[id]/page.tsx             # 论文详情：摘要 + 引用 + 虫洞入口
    explore/[interactionId]/page.tsx # 虫洞探索：滑块 + 虫洞卡片
    map/[interactionId]/page.tsx    # 引用关系地图
    memory/page.tsx                 # 记忆画像 + 重置
    review/page.tsx                 # 文献综述生成器
    api/
      search/route.ts               # POST 论文搜索
      summarize/route.ts            # POST 论文摘要提取
      citation/route.ts             # POST 引用格式生成
      wormholes/route.ts            # POST 虫洞生成
      feedback/route.ts             # POST 反馈提交
      memory/route.ts              # GET/DELETE 记忆查询/重置
      review/route.ts              # POST 文献综述生成

  components/
    PaperCard.tsx
    FeedbackBar.tsx
    CitationFormatter.tsx
    WormholeCard.tsx
    SerendipitySlider.tsx
    MemoryPanel.tsx
    ConceptTags.tsx
    KnowledgeMap.tsx

  lib/
    types.ts                        # ★ 契约文件——全队数据唯一事实来源
    agent/
      orchestrator.ts               # ★ 集成核心——INTEGRATION POINT 全在这
      tools.ts                      # 工具注册表
    api/
      openalex.ts                   # OpenAlex API 封装
      crossref.ts                   # CrossRef API 封装
    paper/
      search.ts                     # 论文搜索 + 偏好排序
      summarize.ts                  # 摘要提取（Ollama + OpenAlex 兜底）
      citation.ts                   # 引用格式生成（模板拼接）
      review.ts                     # 文献综述生成
    wormhole/
      generate.ts                   # 虫洞路径生成（引用 2-3 跳）
      score.ts                      # 概念差异度 + bridge + quality 评分
      paths.ts                      # 图路径搜索
    memory/
      getMemory.ts                  # 读取用户偏好
      compileFeedback.ts            # 反馈 → 记忆 patch
      applyPatch.ts                  # 应用 patch 到记忆
      rankWithMemory.ts             # 按记忆重排搜索结果
    llm/
      provider.ts                   # LLM 抽象（Ollama / 不可用）
      deterministicProvider.ts       # 无 LLM 时的确定性分支

  prisma/
    schema.prisma
    seed.ts

  data/
    seed-papers.json                # 50+ 篇论文（离线缓存用）
    seed-concepts.json              # 50+ 概念
    seed-edges.json                 # 80+ 概念关系边

  tests/
    unit/
      search.test.ts
      citation.test.ts
      wormhole-score.test.ts
      memory-compiler.test.ts
      feedback-ranking.test.ts
    e2e/
      demo.spec.ts

  docs/
    demo-script.md
    responsibility-packages.md

  README.md
```

---

## 20. 三人责任包划分

### 20.1 队长（你）：架构整合 / 主应用闭环 / Demo 统筹

| 项目 | 内容 |
|---|---|
| 责任范围 | 项目架构、接口冻结、任务拆解、进度控制、代码合并、测试验收、Demo 和答辩 |
| 主优化目标 | 保证三名队员成果能合成一个稳定可演示的论文 Agent |
| 必做工作 | 建主 repo；冻结 types.ts；维护任务看板；合并 patch；跑测试；统一 UI 术语；写 README 和 Demo 脚本 |
| 必做验收 | 每天至少一次集成；每个责任包必须能独立跑通测试；最终 3 分钟 Demo 必须在 clean seed 后完整跑通 |
| 交付物 | 主 repo、接口文档、总 README、Demo 脚本、验收记录、答辩讲稿 |
| 兜底边界 | 只做接口适配、冲突合并、轻量 bugfix；队员模块失败时降级为标注的 fallback，不伪装完成 |
| **禁止** | 不替队员写核心算法；不把队员未完成模块改成静态假数据 |

具体任务清单：
1. 建 Next.js + Prisma 项目骨架
2. 写 `lib/types.ts` 冻结所有数据结构
3. 写 `orchestrator.ts` 标好所有 `INTEGRATION POINT`
4. 写假数据引擎（fallback）让全链路第一天能跑
5. 写 6 个页面 + 8 个组件的 UI 骨架
6. 写 7 个 API route（收请求 → 转给 orchestrator → 返结果）
7. 合并三人 patch，跑完整测试
8. 写 README + Demo 脚本 + 答辩讲稿

### 20.2 队友一：论文检索 / 馆藏 grounding / 引用格式

| 项目 | 内容 |
|---|---|
| 责任范围 | 论文搜索、引用格式生成、资源排序、API 封装 |
| 主优化目标 | 让 Agent 首先像真正懂论文的工具，不是泛聊天机器人 |
| 必做实现 | `lib/api/openalex.ts`、`lib/api/crossref.ts`、`lib/paper/search.ts`、`lib/paper/citation.ts`、`/api/search`、`/api/citation` |
| 必做实验 | 不同 taskType 下排序对照；中文优先/英文优先排序差异；引用格式三种对照 |
| 必做测试 | search-api.test.ts、citation.test.ts、无 LLM fallback 测试 |
| 交付物 | patch、API 封装、排序对照表、引用格式样例 |
| 验收标准 | 输入"我想入门 AI Agent 做项目"返回至少 5 篇有摘要有概念的论文；粘 DOI 能生成正确的 APA/MLA/国标格式 |

具体任务清单：
1. 封装 OpenAlex API（搜索、详情、引用关系、概念标签、摘要重建）
2. 封装 CrossRef API（DOI 直查、标题搜索）
3. 实现 `paper_search(query, filters)` 返回论文卡列表
4. 实现 `citation_format(doi, style)` 返回格式化引用
5. 填充 `data/seed-papers.json`（50+ 篇，离线缓存用）
6. 写 search-api.test.ts 和 citation.test.ts
7. 输出排序对照表：project vs research vs coursework 用户看到的不同结果
8. 给答辩准备 150 字说明：论文虫洞功能怎么帮你 30 秒判断一篇论文值不值得读

### 20.3 队友二：虫洞算法 / 反馈记忆 / 概念图谱

| 项目 | 内容 |
|---|---|
| 责任范围 | 概念图谱、虫洞路径生成、滑块排序、反馈记忆编译、记忆注入排序 |
| 主优化目标 | 让"意外"可控、可解释、可复现，并能被反馈记忆持续调整 |
| 必做实现 | `lib/wormhole/generate.ts`、`lib/wormhole/score.ts`、`lib/memory/compileFeedback.ts`、`lib/memory/applyPatch.ts`、`lib/memory/rankWithMemory.ts`、`/api/wormholes`、`/api/feedback`、`/api/memory` |
| 必做实验 | slider=20/50/70/90 虫洞结果对照；反馈前后排序变化对照；低 bridge 淘汰实验 |
| 必做测试 | wormhole-score.test.ts、memory-compiler.test.ts、feedback-ranking.test.ts |
| 交付物 | patch、算法说明、权重表、实验对照表、可写进答辩的"可控偶然性"说明 |
| 验收标准 | 同一查询 slider=20 和 slider=70 返回明显不同结果；用户反馈"太难"后高数学论文排名下降 |

具体任务清单：
1. 实现 `generateWormholes(startPaperId, sliderValue)` — 引用 2-3 跳路径
2. 实现 `score.ts` — novelty/bridge/quality/final 评分
3. 实现 `compileFeedback(feedback)` — 反馈编译成 memory patch
4. 实现 `applyPatch(memory, patches)` — 应用 patch 更新记忆
5. 实现 `rankWithMemory(papers, memory)` — 按记忆重排搜索结果
6. 填充 `data/seed-concepts.json`（50+ 概念）和 `data/seed-edges.json`（80+ 边）
7. 写 slider 对照实验表：20/50/70/90 各返回什么，为什么不同
8. 写反馈前后对照表：反馈"太难"前后排名如何变化
9. 给答辩准备 150 字说明：论文虫洞功能如何做到"不是随机，而是可控偶然"

### 20.4 接口约定（冻结后不许改）

```typescript
// 唯一事实来源：lib/types.ts

type PaperId = string;
type UserId = string;
type InteractionId = string;

type PaperCard = {
  id: PaperId;
  title: string;
  doi: string | null;
  year: number;
  authors: string[];
  citedByCount: number;
  abstract: string | null;
  concepts: ConceptTag[];
  openAccess: boolean;
  _rankScore?: number;       // 排序分（内部用）
};

type ConceptTag = {
  id: string;
  name: string;
  score: number;
  level: number;
};

type WormholeCard = {
  id: string;
  path: PaperId[];
  startConcepts: ConceptTag[];
  targetConcepts: ConceptTag[];
  targetPaper: PaperCard;
  explanation: string;
  scores: {
    novelty: number;
    bridge: number;
    quality: number;
    final: number;
  };
};

type CitationResult = {
  doi: string;
  style: "apa" | "mla" | "gbt7714" | "chicago";
  text: string;
  metadata: CitationMetadata;
  source: "crossref" | "manual";
};

type Feedback = {
  targetType: "paper" | "wormhole" | "citation";
  targetId: string;
  rating: "too_theoretical" | "too_empirical" | "too_hard" | "just_right" | "interesting";
  freeText: string | null;
};

type MemoryPatch = {
  key: string;
  operation: "set" | "add_or_increment" | "decrement" | "remove";
  value: unknown;
  confidenceDelta: number;
};
```

冻结后，任何人修改字段都必须同步改测试和示例数据。**只允许加可选字段，禁止改名/删字段。**

---

## 21. 实现优先级

### Day 1：骨架 + 核心搜索

1. 建 Next.js + Prisma 项目
2. 完成 schema 和 seed 数据
3. 封装 OpenAlex API（队友一）
4. 跑通 `/api/search` — 能搜论文了
5. 跑通基础首页和论文列表
6. 冻结 types.ts

### Day 2：引用格式 + 反馈记忆

1. 封装 CrossRef API（队友一）
2. 跑通 `/api/citation` — DOI → 引用格式
3. 实现反馈记忆引擎（队友二）
4. 跑通 `/api/feedback` + `/api/memory`
5. 实现 `rankWithMemory` — 反馈后搜索结果排序变化
6. **闭环验证**：搜论文 → 点"太理论" → 再搜 → 排序变了 ✓

### Day 3：虫洞 + 摘要 + 测试 + Demo

1. 实现虫洞算法（队友二）
2. 跑通 `/api/wormholes` — 滑块改变结果
3. 实现论文摘要（队长，Ollama + OpenAlex 兜底）
4. 跑通 `/api/summarize`
5. 写测试（单测 + E2E）
6. 写 Demo 脚本
7. 修 UI + 统一术语 + 准备答辩

---

## 22. 测试与验收

### 22.1 单元测试

必须覆盖：

- [ ] `paper_search` 返回论文列表，每篇有标题/摘要/概念/被引数
- [ ] `citation_format` DOI → APA/MLA/国标格式正确（标点空格不错）
- [ ] `compileFeedback` 反馈"太难" → mathTolerance 下降
- [ ] `compileFeedback` 反馈"有趣" → likedDomains 加入
- [ ] `rankWithMemory` 偏好实证 → 实证论文排名上升
- [ ] `rankWithMemory` mathTolerance < 0.4 → 数学重论文排名下降
- [ ] `generateWormholes` slider=20 vs slider=70 返回明显不同结果
- [ ] `generateWormholes` 没有 paper 落点的虫洞被淘汰
- [ ] `generateWormholes` bridge_score < 0.35 的候选被淘汰
- [ ] `generateWormholes` 每条虫洞都有 explanation

### 22.2 API 测试

- [ ] POST /api/search — 返回论文列表 + memoryUsed
- [ ] POST /api/citation — 返回格式化引用
- [ ] POST /api/summarize — 返回摘要 + 论点/结论
- [ ] POST /api/feedback — 返回 memoryPatches
- [ ] GET /api/memory — 返回偏好画像 + 更新历史
- [ ] DELETE /api/memory — 记忆重置
- [ ] POST /api/wormholes — 返回虫洞列表 + 分数
- [ ] POST /api/review — 返回综述段落（Ollama 挂了走 concat 并标注 source）

### 22.3 E2E Demo 测试

```
打开首页
  -> 输入："我想入门 AI Agent，准备用它做一个项目"
  -> 查看论文列表
  -> 对一条结果点"太理论了"
  -> 再搜一次 -> 排序明显变了，实证论文排前面
  -> 点开一篇论文 -> 看到论点/结论提取
  -> 点"生成引用" -> 粘 DOI -> APA 格式 -> 一键复制
  -> 点"试试知识虫洞" -> 滑块拉到 70
  -> 看到虫洞：AI Agent -> Multi-Agent -> Game Theory -> Mechanism Design
  -> 点"太难了" -> 打开 /memory 页 -> mathTolerance 下降
  -> 点"重置 Demo 记忆" -> 记忆归零
```

---

## 23. Demo 脚本（3 分钟）

### 开场（15 秒）

Google Scholar 帮你搜论文，搜完就不管你了。Wormhole 的论文虫洞功能会记住你的口味——你说"太理论了"，下次它就优先推实证的。偶尔还会带你拐到一个你从没搜过的领域。

### 第一步：搜索 + 反馈（45 秒）

输入：`我想入门 AI Agent，准备用它做一个项目`

展示：论文列表，每篇带摘要 + 概念标签 + 被引数。

对一条偏理论的论文点"太理论了"。

### 第二步：记忆生效（30 秒）

再搜一次同样的关键词。

**重点**：结果排序明显变了——实证类论文排在前面，纯理论的沉到后面。UI 上标着"本次参考了你的偏好：偏好实证研究"。

### 第三步：论文摘要 + 引用格式（30 秒）

点开一篇论文 → 看到论点/结论/引言三段提取。

点"生成引用" → 粘 DOI → 选 APA → 一键复制。

### 第四步：知识虫洞（45 秒）

点"试试知识虫洞" → 意外度拉到 70。

展示虫洞：AI Agent → Multi-Agent Coordination → Game Theory → Mechanism Design

解释：这不是随机推荐。多智能体协作和机制设计都研究"多个主体如何在规则下行动"，有直接的知识桥梁。

点"太难了"。

### 第五步：记忆透明页（15 秒）

打开 /memory 页 → 看到：数学容忍度下降、经济学方向加入偏好、更新历史时间线。

### 收尾

Wormhole 的论文虫洞功能把论文搜索从"搜完就不管你了"变成"一个会记住你的 Agent"。搜索、引用、摘要都走免费 API 零 token 成本，反馈记忆走本地 SQLite 毫秒级响应。偶尔带你拐到一个你从没搜过的领域——这是"制造意外"。

---

## 24. Seed 数据要求

### 离线缓存用（OpenAlex 限流时的 fallback）

| 文件 | 数量 | 内容 |
|---|---|---|
| `seed-papers.json` | 50+ 篇 | 论文（标题/DOI/年份/作者/摘要/概念/被引数）|
| `seed-concepts.json` | 50+ 个 | 概念节点（name/aliases/domain/score）|
| `seed-edges.json` | 80+ 条 | 概念关系边（source/target/weight）|

### 必须包含的概念链（虫洞 Demo 用）

1. AI Agent → Multi-Agent Coordination → Game Theory → Mechanism Design
2. AI Agent → Agent Memory → Human Memory → Cognitive Psychology → Forgetting Curve
3. Transformer → Information Theory → Statistical Physics → Phase Transition
4. RAG → Information Retrieval → Library Science → Personal Knowledge Management

### 必须包含的论文

- Artificial Intelligence: A Modern Approach
- Attention Is All You Need
- Multiagent Systems (Wooldridge)
- An Introduction to Game Theory (Osborne)
- Cognitive Psychology and Its Implications
- Introduction to Information Retrieval

### Demo 用户

- 1 个 demo user（`demo-user`）
- 3 条初始 memory（偏好实证、中文优先、mathTolerance=0.5）

---

## 25. 硬规矩（不许造假）

1. **反馈必须真的改变后续推荐**。用户说"太理论了"，下次搜索排序必须真的变。
2. **记忆必须有据可查**。/memory 页展示偏好画像 + 更新历史，不是黑箱。
3. **引用格式必须是真的**。APA 就是 APA，标点空格不能错。调 CrossRef 拿真实元数据，不编造。
4. **论文摘要必须是论文内容的真实提取**。Ollama 挂了就用 OpenAlex 原文摘要，不能用通用废话编。
5. **虫洞必须落在真实论文上**。终点必须是有 DOI 的真实论文，不能凭空编。
6. **每个虫洞必须展示路径**。展示 A→B→C 的引用链 + 人话解释，让用户理解"为什么拐到这里"。
7. **滑块必须真实改变排序**。slider=20 和 slider=70 返回明显不同的虫洞。
8. **clone 下来必须能跑**。npm install && npm run dev 就能起步，不依赖外部 API Key。
9. **降级必须标注**。用了 fallback 数据就标"离线缓存"，Ollama 挂了就标"原文摘要"。不骗用户。

---

## 26. 最终完成定义

项目完成必须同时满足：

- [ ] 本地能运行（npm install && npm run dev）
- [ ] 首页就是可用的论文搜索 Agent，不是概念介绍页
- [ ] 论文搜索返回真实论文数据（OpenAlex API）
- [ ] 引用格式生成正确（CrossRef API + 模板，APA/MLA/国标）
- [ ] 反馈会改变记忆（compileFeedback → memory patch）
- [ ] 记忆会影响下一次搜索排序（rankWithMemory）
- [ ] /memory 页展示偏好画像 + 更新历史
- [ ] 虫洞路径可生成且滑块影响排序
- [ ] 每条虫洞有解释和路径
- [ ] 论文摘要可提取论点/结论（Ollama 挂了走 OpenAlex 原文）
- [ ] 三人责任包都有独立交付物
- [ ] Demo 能在 3 分钟内讲完
- [ ] 无 LLM API Key 时核心链路可跑（搜索+引用+记忆）

---

## 附录：跟 v1.3 原版的差异对照

| 维度 | v1.3 原版 | v2.0 改版 |
|---|---|---|
| 产品定位 | 图书馆垂类 Agent | 论文 Agent（会记住你） |
| 主赛道 | 四赛道并列 | 七牛云为主，开放原子/奇绩创坛为加分 |
| 馆藏数据 | 自建 seed | OpenAlex API（免费真实）|
| 引用格式 | 无 | CrossRef API + 模板（APA/MLA/国标）|
| 论文摘要 | 无 | OpenAlex 摘要重建 + Ollama 提取论点 |
| 记忆引擎 | 从零写 | 已有 Python 版，TS 重写 or 包微服务 |
| 虫洞算法 | NLP 语义相似度 | OpenAlex 概念标签集合运算（已验证）|
| Living Library | 核心功能 | **砍掉** |
| Knowledge Collision | 核心功能 | **砍掉** |
| 人物匹配 | 核心功能 | **砍掉** |
| 前端页面 | 5 个页面 | 6 个页面（新增论文详情 + 综述）|
| API 路由 | 6 个 | 7 个（新增 citation + summarize）|
| Demo 主线 | 虫洞为主 | 反馈→记忆→排序变化为主 |
| 降级策略 | 有 | 有 + 验证过的 API fallback |
| 记忆成本 | 未分析 | 有成本表（核心链路零 token）|
