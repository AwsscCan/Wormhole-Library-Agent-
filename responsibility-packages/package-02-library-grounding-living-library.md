# 责任包 02：队友一任务包

角色：图书馆资源层 / 馆藏 grounding / Living Library 数据与隐私流程  
成员：队友02  
工作模式：独立负责“图书馆为什么是图书馆”的资源基础，不能只做数据录入。

## 1. 主优化目标

保证 Wormhole 的所有推荐都能落到真实感足够强的图书馆资源上：

```text
书
论文
课程
学位论文
书架位置
馆藏状态
Living Library 人物资源
```

这个包决定项目是否会被评委认为是“图书馆垂类 Agent”，而不是泛知识推荐。

## 2. 责任范围

队友一负责：

1. 馆藏资源 seed 数据。
2. 资源与概念绑定。
3. 馆藏检索适配器。
4. 普通资源排序。
5. 阅读路径资源 grounding。
6. Living Library seed 数据。
7. Living Library consent 状态。
8. 人物资源检索。
9. 资源卡和人物卡所需字段。

不负责：

1. 虫洞 novelty / bridge 核心算法。
2. Memory Compiler。
3. 最终页面集成。
4. Demo 统筹。

## 3. 必做实现

### 3.1 数据文件

实现：

```text
data/seed-resources.json
data/seed-living-books.json
```

至少包含：

1. 30 个馆藏资源。
2. 6 个 Living Library 人物。
3. 每个资源绑定 2 到 5 个概念。
4. 每个 Living Library 人物绑定 2 到 5 个 expertise concepts。
5. 所有人物数据必须是虚构数据。

必须包含资源：

```text
Artificial Intelligence: A Modern Approach
Multiagent Systems
An Introduction to Game Theory
Cognitive Psychology and Its Implications
Introduction to Information Retrieval
图书馆学 / 知识管理相关资源
```

### 3.2 馆藏工具

实现：

```text
lib/catalog/adapter.ts
lib/catalog/seedCatalogAdapter.ts
lib/catalog/ranking.ts
```

必须导出：

```ts
searchCatalog(input): Promise<{ resources: ResourceCard[] }>
rankLibraryResources(resources, context): ResourceCard[]
getResourceDetails(resourceId): Promise<ResourceCard | null>
```

### 3.3 Living Library 工具

实现：

```text
lib/matching/livingLibrary.ts
lib/matching/consent.ts
```

必须导出：

```ts
searchLivingLibrary(conceptIds, options): Promise<LivingBookCard[]>
canShowLivingBook(profile, viewer): boolean
toPersonMatchCard(profile, bridge): PersonMatchCard
```

## 4. 独立技术决策

队友一必须自己决定：

1. 馆藏资源 difficulty 如何标注。
2. 不同 taskType 下资源排序权重。
3. 中文优先和英文优先如何影响排名。
4. Living Library 的匿名卡如何写，既有吸引力又不泄露身份。
5. private / anonymous / named / paused 四种状态如何过滤。

## 5. 必做实验矩阵

### 5.1 资源排序实验

同一查询：

```text
AI Agent
```

分别测试：

| taskType | 预期排序 |
|---|---|
| course | 教材、章节、入门课程优先 |
| project | 实践书、综述、工具相关资料优先 |
| research | 综述论文、经典论文、研究级资料优先 |
| exam | 知识点、教材章节、基础资源优先 |

### 5.2 难度实验

| level | 预期 |
|---|---|
| beginner | intro / undergrad 优先 |
| undergraduate | undergrad 优先，少量 graduate |
| graduate | graduate / research 优先 |
| research | paper / thesis / research 优先 |

### 5.3 隐私实验

| consentState | 是否可出现在结果中 |
|---|---|
| private | 否 |
| discoverable_anonymous | 是，但匿名 |
| discoverable_named | 是，可显示名称 |
| paused | 否 |

## 6. 必做测试

至少写：

```text
tests/unit/catalog-ranking.test.ts
tests/unit/living-library-consent.test.ts
```

测试点：

1. `searchCatalog` 至少返回资源。
2. beginner 不应优先 research 难度。
3. project 任务应优先实践/综述资源。
4. private Living Library 不返回。
5. anonymous Living Library 不暴露姓名或联系方式。
6. named Living Library 可以显示 displayName。

## 7. 交付物

队友一必须交付：

1. patch 或分支。
2. `seed-resources.json`。
3. `seed-living-books.json`。
4. catalog 工具实现。
5. Living Library 工具实现。
6. 排序实验表。
7. 隐私状态测试结果。
8. 运行命令。
9. 失败样例。
10. 150 字答辩说明。

## 8. 可直接放进答辩的说明

Wormhole 首先是一个图书馆垂类 Agent。它不是只生成概念，而是把每一次知识探索都落到馆藏、论文、课程、书架位置或愿意分享经验的人上。Living Library 让图书馆从“书的仓库”变成“知识和人的网络”，并通过匿名和同意机制保证隐私安全。

## 9. 验收标准

通过标准：

1. 输入 `AI Agent` 能返回至少 5 个资源。
2. 每个资源都有 `why`、`difficulty`、`availability` 和概念绑定。
3. 至少 6 个 Living Library 人物可以被 seed。
4. private 人物不会出现在结果中。
5. anonymous 人物不暴露身份。
6. 队友二的虫洞算法可以用你的资源作为落点。

不通过标准：

1. 只有资源标题，没有图书馆字段。
2. Living Library 使用真实个人信息。
3. 所有 taskType 返回同样排序。
4. 人物匹配没有 consent 过滤。

