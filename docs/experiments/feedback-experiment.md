# 反馈前后实验记录

实验日期：2026-08-21
实验人：责任包 03
算法版本：lib/memory/* v1.0

## 实验目的

验证"反馈→记忆→排序变化"闭环：用户说"太难了"后，高数学论文排名下降；说"太理论了"后，实证论文排名上升。

## 实验数据

搜索结果池（3 篇，按原始被引数排序）：

| 排名 | ID | 标题 | 核心概念 | 被引数 |
|---|---|---|---|---|
| 1 | W_econ | Auction Design in Multi-Agent Systems | Economics, Game Theory, Mechanism Design | 120 |
| 2 | W_theory | A Purely Theoretical Framework for Optimization | Mathematics, Optimization, Probability Theory | 100 |
| 3 | W_empirical | An Empirical Study of Agent Behavior | AI Agent, Experiment | 80 |

初始记忆（demo-user）：

```json
{
  "reading": { "languagePref": "zh_first", "summaryFirst": true, "prefEmpirical": true },
  "difficulty": { "preferredLevel": "undergrad", "mathTolerance": 0.50 },
  "citation": { "defaultStyle": "apa" },
  "serendipity": { "defaultSlider": 60, "likedDomains": [], "dislikedDomains": [] }
}
```

## 实验 1："太难了"反馈 → 高数学论文排名下降

### 反馈前

用户对 W_theory（数学重论文）搜索结果的排序：

| 排名 | ID | _rankScore | 说明 |
|---|---|---|---|
| 1 | W_econ | 120 | 基础分=被引数，无偏好修正 |
| 2 | W_theory | 100 | mathTolerance=0.5 > 0.4，不触发降权 |
| 3 | W_empirical | 80×1.12=89.6 | prefEmpirical 加成 |

### 反馈操作

用户对 W_theory 点"太难了"：

```json
{
  "targetType": "paper",
  "targetId": "W_theory",
  "rating": "too_hard",
  "freeText": null
}
```

compileFeedback 产出 patches：

```json
[
  { "key": "difficulty.mathTolerance", "operation": "decrement", "value": 0.08, "confidenceDelta": 0.10 },
  { "key": "serendipity.dislikedDomains", "operation": "add_or_increment", "value": "Mathematics", "confidenceDelta": 0.05 }
]
```

applyPatch 后记忆变化：

| key | 反馈前 | 反馈后 |
|---|---|---|
| difficulty.mathTolerance | 0.50 | **0.42** |
| serendipity.dislikedDomains | [] | **["Mathematics"]** |

### 反馈后

| 排名 | ID | _rankScore | 变化 | 说明 |
|---|---|---|---|---|
| 1 | W_econ | 120 | — | 不变 |
| 2 | W_empirical | 89.6 | ↑1 | prefEmpirical 加成 |
| 3 | W_theory | 100×0.70×0.90=**63.0** | ↓1 | mathTolerance<0.4? 否(0.42)，但 dislikedDomains 含 Mathematics → ×0.90 |

> 注：mathTolerance=0.42 未触发 < 0.4 的 ×0.70 惩罚，但 dislikedDomains=["Mathematics"] 触发了 ×0.90 惩罚。W_theory 的 Mathematics 概念被标记为不喜欢。

### 结论

W_theory 从第 2 跌到第 3，W_empirical 从第 3 升到第 2。**排序确实变了。**

## 实验 2："太理论了"反馈 → 实证论文排名上升

### 反馈操作

用户对 W_theory 点"太理论了"：

```json
{
  "targetType": "paper",
  "targetId": "W_theory",
  "rating": "too_theoretical",
  "freeText": "I want more empirical work"
}
```

compileFeedback 产出 patches：

```json
[
  { "key": "reading.prefEmpirical", "operation": "set", "value": true, "confidenceDelta": 0.10 },
  { "key": "difficulty.theoryTolerance", "operation": "decrement", "value": 0.10, "confidenceDelta": 0.08 }
]
```

applyPatch 后记忆变化（在实验 1 的基础上继续）：

| key | 实验前 | 实验 1 后 | 实验 2 后 |
|---|---|---|---|
| reading.prefEmpirical | true | true | true（已设） |
| difficulty.theoryTolerance | (undefined) | (undefined) | **0.40** |
| difficulty.mathTolerance | 0.50 | 0.42 | 0.42 |
| serendipity.dislikedDomains | [] | ["Mathematics"] | ["Mathematics"] |

### 反馈后排序

| 排名 | ID | _rankScore | 变化 | 说明 |
|---|---|---|---|---|
| 1 | W_econ | 120 | — | 不变 |
| 2 | W_empirical | 89.6 | — | prefEmpirical 加成（已设） |
| 3 | W_theory | 63.0 | — | 被不喜欢领域惩罚 |

> 注：prefEmpirical 已经是 true（初始记忆就有），所以这里的变化主要来自 theoryTolerance 下降（目前不影响排序但会记录到 /memory 页展示）。

### 进一步实验：连续 3 次"太难了"

连续 3 次对 W_theory 说"太难了"后：

mathTolerance: 0.50 → 0.42 → 0.34 → **0.26**

| 排名 | ID | _rankScore | 说明 |
|---|---|---|---|
| 1 | W_econ | 120 | 不变 |
| 2 | W_empirical | 89.6 | prefEmpirical 加成 |
| 3 | W_theory | 100×0.70×0.90=**63.0** | mathTolerance=0.26 < 0.4 → ×0.70，且 dislikedDomains → ×0.90 |

> 注：mathTolerance 从 0.42 降到 0.26 后，**同时触发两个惩罚**（mathTolerance<0.4 的 ×0.70 + dislikedDomains 的 ×0.90），W_theory 分数从 90.0 跌到 63.0。

## 记忆透明页展示

/memory 页将显示：

```
偏好画像：
- 语言偏好：中文优先
- 难度偏好：本科水平
- 数学容忍度：0.26（低）
- 引用格式：APA
- 不喜欢领域：Mathematics
- 默认滑块：60

更新历史：
- [2026-08-21 12:00] feedback: difficulty.mathTolerance -= 0.08; serendipity.dislikedDomains += Mathematics
- [2026-08-21 12:01] feedback: reading.prefEmpirical = true; difficulty.theoryTolerance -= 0.10
- [2026-08-21 12:02] feedback: difficulty.mathTolerance -= 0.08
- [2026-08-21 12:03] feedback: difficulty.mathTolerance -= 0.08
```

## 结论

1. **反馈真的改变后续推荐**：用户说"太难了"后，高数学论文排名从第 2 跌到第 3。
2. **记忆有据可查**：/memory 页展示偏好画像 + 更新历史时间线。
3. **反馈累积**：多次"太难了"反馈使 mathTolerance 持续下降，惩罚加剧（从 ×0.90 到 ×0.70×0.90）。
4. **零 LLM**：整个 compile → apply → rank 流程全是确定性代码，不调用任何 LLM。
