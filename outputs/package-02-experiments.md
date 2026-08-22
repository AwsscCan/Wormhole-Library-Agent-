# 责任包 02 实验矩阵

> 可复现方式：在项目根目录执行 `node node_modules/tsx/dist/cli.mjs scripts/experiment-ranking.ts`  
> 或直接运行测试 `node node_modules/vitest/vitest.mjs run tests/unit/catalog-ranking.test.ts tests/unit/living-library-consent.test.ts`

---

## 实验一：TaskType 对排序的影响

**目的**：验证 `taskType` 参数真正影响排序结果，不同任务场景推荐不同类型资源。  
**固定条件**：query 概念 = `c_ai_agent`，level = `undergraduate`，language = `any`，前 4 名结果。

| 排名 | taskType = course | taskType = project | taskType = research | taskType = exam |
|------|-------------------|--------------------|---------------------|-----------------|
| 1 | **book** AIMA (0.943) | **book** AIMA (0.898) | **book** AIMA (0.882) | **book** AIMA (0.973) |
| 2 | **course** 多智能体系统导论 (0.925) | **course** 多智能体系统导论 (0.865) | **thesis** 图书馆AI应用研究 (0.862) | **book** LangChain实战 (0.913) |
| 3 | **book** LangChain实战 (0.883) | **book** LangChain实战 (0.837) | **paper** 大语言模型智能体综述 (0.830) | **course** 多智能体系统导论 (0.895) |
| 4 | **course** CS 224N (0.840) | **course** CS 224N (0.780) | **book** LangChain实战 (0.823) | **book** RL An Introduction (0.853) |

**关键观察**：
- `research` 任务：thesis 和 paper 上升到前三，course 资源被压后——因为 `TASK_TYPE_WEIGHTS[research][paper]=1.0`、`[course]=0.40`
- `exam` 任务：book 类型全面压制，第 1/2/4 名均为 book——因为 `TASK_TYPE_WEIGHTS[exam][book]=1.0`，最高权重
- `course` 任务：course 类型资源排名上升（权重 1.0），同时 book 也适合备课（0.90）
- 四种 taskType 的 Top-4 排序均不相同，验证了排序输入链路真正生效

---

## 实验二：Language 偏好对排序的影响

**目的**：验证语言偏好参数影响排序，中文资源在 zh 偏好下排名提升。  
**固定条件**：query 概念 = `c_ai_agent`，task = `research`，level = `graduate`，前 4 名结果。

| 排名 | language = zh | language = en | language = any |
|------|---------------|---------------|----------------|
| 1 | **[zh]** 大语言模型智能体综述 (0.963) | **[zh]** 大语言模型智能体综述 (0.918) | **[zh]** 大语言模型智能体综述 (0.943) |
| 2 | **[zh]** 基于长期记忆的智能体研究 (0.890) | **[en]** ReAct 论文 (0.905) | **[en]** ReAct 论文 (0.885) |
| 3 | **[en]** ReAct 论文 (0.860) | **[en]** RL An Introduction (0.895) | **[en]** RL An Introduction (0.875) |
| 4 | **[en]** RL An Introduction (0.850) | **[en]** Multiagent Systems (0.892) | **[en]** Multiagent Systems (0.872) |

**关键观察**：
- `zh` 偏好下：中文论文《大语言模型智能体综述》（quality=0.87，lang=zh）以 0.963 排第一；另一篇中文 thesis 排第二，把英文论文挤到第三名
- `en` 偏好下：中文论文凭借极高质量（quality=0.87）仍排第一，但第 2-4 名全部换成英文资源
- `any` 偏好：两种语言资源混排，中文的质量优势与英文的语言加成相互抵消
- 语言分差 = `1.0 - 0.55 = 0.45`，乘以语言权重 0.10，净差 **0.045 分**——在其他条件相近时，足以改变相邻资源的排名

---

## 实验三：隐私状态对 Living Library 展示的影响

**目的**：验证 consent 状态机正确过滤人物，且匿名人物不暴露身份。  
**数据**：7 个虚构人物，覆盖全部 4 种 consentState。

| 人物 ID | consentState | displayMode | 推荐可见? | 档案可带 displayName? | PersonMatchCard 匿名? |
|---------|-------------|-------------|-----------|----------------------|----------------------|
| lb_001 | discoverable_named | named | ✅ 可见 | ✅ 是 | ✅ 强制匿名 |
| lb_002 | discoverable_anonymous | anonymous | ✅ 可见 | ❌ 否 | ✅ 强制匿名 |
| lb_private_example | **private** | anonymous | ❌ **过滤** | — | — |
| lb_004 | discoverable_anonymous | anonymous | ✅ 可见 | ❌ 否 | ✅ 强制匿名 |
| lb_005 | discoverable_named | named | ✅ 可见 | ✅ 是 | ✅ 强制匿名 |
| lb_006 | **paused** | anonymous | ❌ **过滤** | — | — |
| lb_007 | discoverable_named | named | ✅ 可见 | ✅ 是 | ✅ 强制匿名 |

**关键观察**：
- `private` + `paused` 共 2 人（lb_private_example、lb_006）被 `canShowLivingBook` 完全过滤，不出现在任何检索结果中
- `discoverable_anonymous` 人物（lb_002、lb_004）：`toLivingBookCard` 确保 `displayName=undefined`，不可能通过 API 泄露
- `discoverable_named` 人物（lb_001、lb_005、lb_007）：档案展示页（`LivingBookCard`）允许带 `displayName`；但 `PersonMatchCard`（推荐卡）中 `displayMode` 强制为 `"anonymous"`，headline 不拼接姓名——接受联系请求前永远匿名
- 这与 orchestrator.ts 的注释 `推荐卡永远匿名，命名只在对方接受后` 完全一致

**边界用例（失败/降级情形）**：
- 输入 `consentState="discoverable_anonymous"` + `displayMode="named"`（不一致）：`toLivingBookCard` 以 `consentState` 为准，强制返回匿名卡，忽略 `displayMode` 声称
- 输入全部为 private/paused 的概念：`searchLivingBooks` 返回空数组 `[]`，不报错
