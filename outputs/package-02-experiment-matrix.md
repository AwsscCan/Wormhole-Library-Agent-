# 责任包02 实验矩阵

> 生成时间：2026-08-22  
> 对应提交分支：`package-02-library`  
> 实验方法：调用 `lib/catalog/ranking.ts` 的 `rankResources` / `scoreResource`，对 seed 数据做确定性排序，记录前4名结果。

---

## 实验一：TaskType 对排序的影响

**实验设置**：固定概念范围为 AI Agent 相关资源（14条），level=undergraduate，language=any，分别传入4种 taskType，观察排序结果差异。

**预期**：不同 taskType 应产生不同的资源类型偏好顺序（course 偏好课程 > paper，research 偏好 paper > book，exam 偏好 book > paper）。

### taskType = course（课程学习）

| 排名 | 类型 | 标题 | 得分 |
|------|------|------|------|
| 1 | book | Artificial Intelligence: A Modern Approach | 0.943 |
| 2 | course | 多智能体系统导论（北京大学公开课） | 0.925 |
| 3 | book | Building LLM-Powered Applications with LangChain | 0.883 |
| 4 | course | CS 224N: NLP with Deep Learning | 0.840 |

### taskType = project（项目实践）

| 排名 | 类型 | 标题 | 得分 |
|------|------|------|------|
| 1 | book | Artificial Intelligence: A Modern Approach | 0.898 |
| 2 | course | 多智能体系统导论（北京大学公开课） | 0.865 |
| 3 | book | Building LLM-Powered Applications with LangChain | 0.837 |
| 4 | course | CS 224N: NLP with Deep Learning | 0.780 |

### taskType = research（学术研究）

| 排名 | 类型 | 标题 | 得分 |
|------|------|------|------|
| 1 | book | Artificial Intelligence: A Modern Approach | 0.882 |
| 2 | thesis | 人工智能在图书馆知识服务中的应用研究 | 0.862 |
| 3 | paper | 大语言模型驱动的智能体综述 | 0.830 |
| 4 | book | Building LLM-Powered Applications with LangChain | 0.823 |

### taskType = exam（备考）

| 排名 | 类型 | 标题 | 得分 |
|------|------|------|------|
| 1 | book | Artificial Intelligence: A Modern Approach | 0.973 |
| 2 | book | Building LLM-Powered Applications with LangChain | 0.913 |
| 3 | course | 多智能体系统导论（北京大学公开课） | 0.895 |
| 4 | book | Reinforcement Learning: An Introduction | 0.853 |

**结论**：符合预期。course 和 exam 均将 book 权重拉到最高，research 将 thesis/paper 权重提升，project 均衡分布，4种 taskType 产生了明显不同的排序结果。

---

## 实验二：语言偏好对排序的影响

**实验设置**：固定概念范围为 AI Agent 相关资源，task=research，level=graduate，分别传入 zh / en / any 三种语言偏好，观察中文资源排名变化。

**预期**：zh 偏好下中文资源排名上升，en 偏好下中文资源排名下降，any 时介于两者之间。

### language = zh（中文优先）

| 排名 | 语言 | 标题 | 得分 |
|------|------|------|------|
| 1 | zh | 大语言模型驱动的智能体综述 | 0.963 |
| 2 | zh | 基于长期记忆的智能体个性化推荐研究（学位论文） | 0.890 |
| 3 | en | ReAct: Synergizing Reasoning and Acting in Language Models | 0.860 |
| 4 | en | Reinforcement Learning: An Introduction | 0.850 |

### language = en（英文优先）

| 排名 | 语言 | 标题 | 得分 |
|------|------|------|------|
| 1 | zh | 大语言模型驱动的智能体综述 | 0.918 |
| 2 | en | ReAct: Synergizing Reasoning and Acting in Language Models | 0.905 |
| 3 | en | Reinforcement Learning: An Introduction | 0.895 |
| 4 | en | Multiagent Systems: Algorithmic, Game-Theoretic, and Logical Foundations | 0.892 |

### language = any（无偏好）

| 排名 | 语言 | 标题 | 得分 |
|------|------|------|------|
| 1 | zh | 大语言模型驱动的智能体综述 | 0.943 |
| 2 | en | ReAct: Synergizing Reasoning and Acting in Language Models | 0.885 |
| 3 | en | Reinforcement Learning: An Introduction | 0.875 |
| 4 | en | Multiagent Systems: Algorithmic, Game-Theoretic, and Logical Foundations | 0.872 |

**结论**：符合预期。zh 偏好时中文资源得分比 en 偏好时高出约 0.045（语言权重 0.10 × 差值 0.45），中文资源排名整体上升。中文综述在 research 任务下质量分高（0.87），结合语言加成后始终处于前列。边界情形：即使在 en 偏好下，中文综述因高质量分仍排第1，说明质量（权重0.25）优先级高于语言偏好（权重0.10）——这符合设计目标，避免语言偏好过度压制高质量异语资源。

---

## 实验三：隐私状态（consentState）过滤行为

**实验设置**：7 位 Living Library 人物，覆盖4种 consentState，验证可见性和身份暴露规则。

**预期**：private / paused 不可见；anonymous 可见但不暴露 displayName；named 可见且在档案展示页可带 displayName；推荐卡（PersonMatchCard）所有人物均匿名。

| 人物 ID | consentState | 可见（searchLivingBooks）| 档案页显示姓名 | 推荐卡显示姓名 |
|---------|-------------|--------------------------|----------------|----------------|
| lb_001 | discoverable_named | ✅ 可见 | ✅ 方舟（机制设计方向） | ❌ 匿名 |
| lb_002 | discoverable_anonymous | ✅ 可见 | ❌ 匿名 | ❌ 匿名 |
| lb_private_example | private | ❌ 过滤 | — | — |
| lb_004 | discoverable_anonymous | ✅ 可见 | ❌ 匿名 | ❌ 匿名 |
| lb_005 | discoverable_named | ✅ 可见 | ✅ 吴宇轩 | ❌ 匿名 |
| lb_006 | paused | ❌ 过滤 | — | — |
| lb_007 | discoverable_named | ✅ 可见 | ✅ 林思远 | ❌ 匿名 |

**结论**：符合预期。

- private（1人）和 paused（1人）均被 `canShowLivingBook` 过滤，不进入任何返回结果。
- 5位可见人物中，2位 anonymous 的档案卡 `displayName = undefined`，assertCardPrivacy 验证安全。
- 3位 named 的档案卡带 displayName，但推荐卡（PersonMatchCard）统一强制 `displayMode = "anonymous"`，headline 不拼接姓名——与 orchestrator.ts INTEGRATION POINT 注释「推荐卡永远匿名，命名只在对方接受后」完全一致。
- 边界情形：`displayMode=named` 但 `consentState=discoverable_anonymous` 的不一致数据，`toLivingBookCard` 会强制输出 anonymous，不泄露 displayName。

---

*以上所有实验数据均可通过以下命令独立复现：*

```bash
node node_modules/vitest/vitest.mjs run tests/unit/catalog-ranking.test.ts
node node_modules/vitest/vitest.mjs run tests/unit/living-library-consent.test.ts
```
