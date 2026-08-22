# 责任包 03 交付物 — 整合指南

交付人：责任包 03（虫洞算法 / 反馈记忆 / 概念图谱）
交付日期：2026-08-21

## 交付物清单

### 1. Seed 数据

| 文件 | 目标路径 | 数量 | 说明 |
|---|---|---|---|
| `data/seed-concepts.json` | `data/seed-concepts.json` | 58 个概念 | 覆盖 4 条必需概念链 + 跨域概念 |
| `data/seed-edges.json` | `data/seed-edges.json` | 144 条边 | 含 subclass_of / related_to / applied_in / studies / uses |

### 2. 概念模块

| 文件 | 目标路径 | 说明 |
|---|---|---|
| `lib/concepts/conceptExtraction.ts` | 同名 | ConceptExtractor 实现：filter(level>=1, score>0.3) + 文本关键词匹配 |
| `lib/concepts/graph.ts` | 同名 | ConceptGraph 实现：BFS 路径搜索 + 邻接表 + Jaccard 重叠度 + 4 链验证 |
| `lib/concepts/vectors.ts` | 同名 | 集合运算：novelty / novelty_fit / overlap / uniqueConcepts / 加权余弦 |
| `lib/concepts/index.ts` | 同名 | 导出 ConceptExtractorImpl + 工具函数 |

### 3. 虫洞模块

| 文件 | 目标路径 | 说明 |
|---|---|---|
| `lib/wormhole/generate.ts` | 同名 | WormholeEngine 实现：路径搜索 + 评分 + 淘汰 + 记忆修正 + 人话解释 |
| `lib/wormhole/score.ts` | 同名 | 评分函数：novelty/bridge/quality/final/memory correction/diversity/elimination |
| `lib/wormhole/paths.ts` | 同名 | 路径搜索：DFS 引用链遍历 + 去重 + 概念桥接 |
| `lib/wormhole/index.ts` | 同名 | 导出 WormholeEngineImpl + 评分函数 |

### 4. 记忆模块

| 文件 | 目标路径 | 说明 |
|---|---|---|
| `lib/memory/compileFeedback.ts` | 同名 | **真实实现**（非 fallback）：5 种 rating → patch 映射 + 域提取 + 引用格式提取 |
| `lib/memory/applyPatch.ts` | 同名 | 4 种 operation (set/add_or_increment/decrement/remove) + 值钳制 + 历史记录 |
| `lib/memory/getMemory.ts` | 同名 | MemoryStore 接口 + InMemoryStore + 默认记忆 + 快照构建 |
| `lib/memory/rankWithMemory.ts` | 同名 | 排序重排：被引数 × 语言/数学/实证/理论/喜欢/不喜欢 倍率 |
| `lib/memory/renderMemoryContext.ts` | 同名 | 人话上下文渲染 + 历史时间线 + memoryUsed 数组 |
| `lib/memory/index.ts` | 同名 | 导出 MemoryCompilerImpl（实现 MemoryCompiler 接口） |

### 5. 测试

| 文件 | 目标路径 | 测试数 | 覆盖 |
|---|---|---|---|
| `tests/unit/wormhole-score.test.ts` | 同名 | 18 | novelty / novelty_fit / bridge / quality / final / elimination / memory correction / diversity / 4 链验证 / 无 LLM 确定性 / slider 20 vs 70 |
| `tests/unit/memory-compiler.test.ts` | 同名 | 20 | 5 种 rating → patch / applyPatch 4 种 operation / 值钳制 / 不重复 / 不变异 / 渲染 / 预算 / 集成闭环 |
| `tests/unit/feedback-ranking.test.ts` | 同名 | 14 | prefEmpirical / mathTolerance / likedDomains / dislikedDomains / 原始排序 / _rankScore / 不变异 / 太理论反馈 / 太难反馈 / 有趣反馈 / 多次累积 / 无 LLM 确定性 |

### 6. 实验记录

| 文件 | 目标路径 | 内容 |
|---|---|---|
| `docs/experiments/slider-experiment.md` | 同名 | slider 20/50/70/90 对照表 + 排名变化分析 + 结论 |
| `docs/experiments/feedback-experiment.md` | 同名 | "太难"反馈前后排名变化 + "太理论"反馈 + 连续 3 次累积 + /memory 页展示 |
| `docs/experiments/elimination-experiment.md` | 同名 | 5 候选淘汰实验 + shouldEliminate 逐条验证 + 公式推导 |

## 整合步骤

### Step 1: 复制文件

将 `paperworm-pkg03/` 下所有文件按上表路径复制到主 repo。

### Step 2: 替换 types.ts

`lib/types.ts` 是本地副本（与设计文档 v2.0 第 20.4 节一致）。如果你的冻结版本有差异：
- 只可能多加了可选字段——不影响
- 如果改了名或删了字段——需要同步调整我的导入

### Step 3: 更新 orchestrator

将 `lib/agent/orchestrator.ts` 中的 fallback 调用替换为正式实现：

```typescript
// Before (fallback):
import { extractConceptsFallback } from "../mock/fallbackEngine";
import { generateWormholesFallback } from "../mock/fallbackEngine";
import { compileFeedbackFallback } from "../mock/fallbackEngine";

// After (正式):
import { ConceptExtractorImpl } from "../concepts";
import { WormholeEngineImpl } from "../wormhole";
import { MemoryCompilerImpl } from "../memory";

const conceptExtractor = new ConceptExtractorImpl();
const wormholeEngine = new WormholeEngineImpl();
const memoryCompiler = new MemoryCompilerImpl();
```

### Step 4: 运行测试

```bash
npm run test -- --run tests/unit/wormhole-score.test.ts
npm run test -- --run tests/unit/memory-compiler.test.ts
npm run test -- --run tests/unit/feedback-ranking.test.ts
```

### Step 5: 验证 4 条概念链

```typescript
import { loadConceptGraph, validateRequiredChains } from "./lib/concepts";
const graph = loadConceptGraph();
console.log("Chains valid:", validateRequiredChains(graph));
// → true
```

## 接口签名（供责任包 01 复核）

### ConceptExtractor

```typescript
interface ConceptExtractor {
  extract(paper: PaperCard): ConceptTag[];
  extractFromText(text: string, graph?: ConceptGraph): ConceptTag[];
}
```

### WormholeEngine

```typescript
interface WormholeEngine {
  generate(params: {
    startPaperId: PaperId;
    sliderValue: number;
    maxPaths?: number;
    papers: Map<PaperId, PaperCard>;
    references: Map<PaperId, PaperId[]>;
    concepts: Map<PaperId, ConceptTag[]>;
    memory?: MemorySnapshot;
    conceptGraph?: ConceptGraph;
  }): WormholeCard[];
}
```

### MemoryCompiler

```typescript
interface MemoryCompiler {
  compile(feedback: Feedback, paper?: PaperCard): MemoryPatch[];
  apply(memory: MemorySnapshot, patches: MemoryPatch[]): { memory: MemorySnapshot; history: MemoryHistoryEntry };
  rank(papers: PaperCard[], memory: MemorySnapshot): PaperCard[];
  getContext(memory: MemorySnapshot, query: string): string;
}
```

## 运行命令

```bash
# 安装依赖
npm install

# 运行测试
npm run test -- --run tests/unit/wormhole-score.test.ts
npm run test -- --run tests/unit/memory-compiler.test.ts
npm run test -- --run tests/unit/feedback-ranking.test.ts

# 运行全部测试
npm run test -- --run

# 启动开发服务器
npm run dev
```

## 不依赖 LLM 的部分

以下模块全部是确定性代码，不调用任何 LLM：

- ✅ 概念提取（关键词匹配）
- ✅ 概念图路径搜索（BFS）
- ✅ 虫洞评分（集合运算 + 加权平均）
- ✅ 虫洞生成（DFS + 排序）
- ✅ 反馈编译（规则映射）
- ✅ 记忆应用（对象操作）
- ✅ 排序重排（乘法）
- ✅ 上下文渲染（字符串拼接）

只有论文摘要和文献综述需要 Ollama，但那些是队长（责任包 01）的实现范围。
