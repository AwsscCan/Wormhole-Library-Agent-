# 责任包 03：队友二任务包

角色：虫洞算法 / Unknown Unknowns / 意外度滑块 / 反馈记忆  
成员：队友03  
工作模式：独立负责“Wormhole 为什么不是普通推荐”的算法与记忆闭环。

## 1. 主优化目标

让系统产生可控、可解释、可复现的知识偶遇，并让用户反馈真实改变后续推荐。

核心闭环：

```text
当前主题
  -> 概念图路径
  -> novelty / bridge / quality / diversity 评分
  -> 虫洞排序
  -> 用户反馈
  -> Memory Compiler
  -> 下一次排序变化
```

## 2. 责任范围

队友二负责：

1. 概念 seed 数据。
2. 概念边 seed 数据。
3. 概念抽取 fallback。
4. 虫洞路径搜索。
5. 虫洞评分函数。
6. Unknown Unknowns 检测。
7. Serendipity Slider 对排序的影响。
8. Memory Compiler。
9. 记忆读取和应用。
10. 算法单元测试和实验对照。

不负责：

1. 馆藏资源 seed。
2. Living Library consent。
3. 最终页面布局。
4. 项目集成统筹。

## 3. 必做实现

### 3.1 数据文件

实现：

```text
data/seed-concepts.json
data/seed-edges.json
```

至少包含：

1. 50 个概念。
2. 80 条概念边。
3. 每条边有 relation、weight、explanation。

必须包含概念链：

```text
AI Agent -> Multi-Agent Coordination -> Game Theory -> Mechanism Design
AI Agent -> Agent Memory -> Human Memory -> Cognitive Psychology -> Forgetting Curve
Transformer -> Information Theory -> Statistical Physics -> Phase Transition
RAG -> Information Retrieval -> Library Science -> Personal Knowledge Management
```

### 3.2 概念与图谱工具

实现：

```text
lib/concepts/conceptExtraction.ts
lib/concepts/graph.ts
lib/concepts/vectors.ts
```

必须导出：

```ts
extractConcepts(query): Concept[]
findConceptPaths(startIds, destinationId, options): ConceptPath[]
cosine(a, b): number
buildUserVector(userId, startConceptIds): number[]
```

### 3.3 虫洞工具

实现：

```text
lib/wormhole/generate.ts
lib/wormhole/score.ts
lib/wormhole/paths.ts
```

必须导出：

```ts
generateWormholes(input): Promise<WormholeCard[]>
rankWormholes(candidates, context): WormholeCard[]
findUnknownUnknowns(input): Promise<UnknownUnknownCard[]>
```

### 3.4 记忆工具

实现：

```text
lib/memory/getMemory.ts
lib/memory/compileFeedback.ts
lib/memory/applyPatch.ts
lib/memory/renderMemoryContext.ts
```

必须导出：

```ts
getUserMemory(userId): Promise<UserMemorySummary>
compileFeedbackMemory(input): MemoryPatch[]
applyMemoryPatch(userId, patches): Promise<UserMemorySummary>
applyMemoryToRanking(score, candidate, memory): number
```

## 4. 评分公式

### 4.1 Novelty

```text
similarity = cosine(user_vector, candidate_vector)
novelty = 1 - similarity
target_novelty = slider_value / 100
novelty_fit = 1 - abs(novelty - target_novelty)
```

### 4.2 BridgeScore

```text
path_strength = average(edge.weight)
path_explainability = 1 - ((path_length - 3)^2 / 9)
bridge_score = 0.65 * path_strength + 0.35 * path_explainability
```

淘汰规则：

```text
bridge_score < 0.35 丢弃
没有馆藏或 Living Library 落点丢弃
```

### 4.3 FinalScore

```text
final_score =
  0.40 * bridge_score
  + 0.30 * novelty_fit
  + 0.20 * quality_score
  + 0.10 * diversity_score
```

记忆修正：

```text
likedDomains 命中：+0.05
dislikedDomains 命中：-0.08
高数学要求且 mathTolerance < 0.4：-0.10
中文优先且资源为中文：+0.04
```

## 5. 独立技术决策

队友二必须自己决定：

1. 伪向量或预置向量如何生成。
2. `quality_score` 如何从队友一的资源数据获得。
3. 多条路径如何选 best path。
4. Unknown Unknowns 和普通虫洞的区别。
5. 用户反馈如何映射成 memory patch。
6. memory confidence 如何更新。

## 6. 必做实验矩阵

### 6.1 Slider 对照

同一输入：

```text
我想入门 AI Agent
```

必须输出：

| slider | 预期方向 |
|---:|---|
| 20 | LLM Agent / Tool Use / Planning |
| 50 | Multi-Agent / Distributed Systems |
| 70 | Game Theory / Mechanism Design |
| 90 | Cognitive Science / Organization Theory 等更远方向 |

### 6.2 反馈前后对照

步骤：

```text
1. slider=70 生成机制设计虫洞
2. 用户反馈：有趣，但数学太难
3. 再次生成
```

预期：

```text
Economics / Mechanism Design 不一定消失
但高数学难度资源排名下降
解释型、入门型资源上升
mathTolerance 下降
likedDomains 包含 Economics
```

### 6.3 淘汰实验

必须证明：

1. 没有 bridge 的候选会被淘汰。
2. 没有馆藏/Living Library 落点的候选会被淘汰。
3. novelty 很高但完全随机的候选不会进入 Top 3。

## 7. 必做测试

至少写：

```text
tests/unit/wormhole-score.test.ts
tests/unit/memory-compiler.test.ts
```

测试点：

1. candidate novelty 越接近 slider，`noveltyFit` 越高。
2. `bridgeScore < 0.35` 被淘汰。
3. 没有资源落点被淘汰。
4. `too_hard` 反馈降低 mathTolerance。
5. `too_close` 反馈提高 defaultSlider 或 noveltyMean。
6. likedDomain 提高对应候选分数。
7. dislikedDomain 降低对应候选分数。
8. 无 LLM 时算法仍可运行。

## 8. 交付物

队友二必须交付：

1. patch 或分支。
2. `seed-concepts.json`。
3. `seed-edges.json`。
4. 虫洞算法实现。
5. 记忆编译实现。
6. slider 对照实验表。
7. 反馈前后对照表。
8. 淘汰实验说明。
9. 单元测试结果。
10. 150 字答辩说明。

## 9. 可直接放进答辩的说明

Wormhole 的意外不是随机。用户通过 Serendipity Slider 指定目标知识距离，系统同时计算 novelty、bridge、quality 和 diversity。只有既陌生、又能通过概念桥解释、并且能落到馆藏或 Living Library 的候选才会出现。用户反馈会被编译成结构化记忆，下一次推荐会真实改变。

## 10. 验收标准

通过标准：

1. slider=20 和 slider=70 的 Top 结果明显不同。
2. 每条虫洞都有 3 到 5 个桥接概念。
3. 每条虫洞都有资源或人物落点。
4. 反馈后 memory JSON 变化。
5. memory 变化能影响下一次排序。
6. 所有核心算法无 LLM 也能跑。

不通过标准：

1. slider 只是 UI 装饰。
2. 虫洞结果是随机硬编码。
3. 反馈只存日志，不改排序。
4. 推荐停在概念，没有图书馆落点。

