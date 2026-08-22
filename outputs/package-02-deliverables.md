# 责任包 02 交付说明

> 队友02：馆藏落地 + Living Library  
> 提交分支：`package-02-library`  
> 测试状态：74/74 通过，类型检查零错误

---

## 可复制的运行命令

```bash
# 进入团队仓库目录
cd /path/to/Wormhole-Library-Agent-

# 安装依赖（跳过 electron 二进制，仅用于测试）
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install

# 运行全量测试
node node_modules/vitest/vitest.mjs run

# 仅跑队友02的两个指定测试
node node_modules/vitest/vitest.mjs run tests/unit/catalog-ranking.test.ts tests/unit/living-library-consent.test.ts

# 类型检查（无任何输出 = 全部正确）
node node_modules/typescript/bin/tsc --noEmit
```

预期输出：`74 passed (74)`，`0 errors`。

---

## 失败用例与边界用例记录

### 边界用例 1：空概念列表

**输入**：`searchCatalog({ query: "AI", conceptIds: [], language: "any" })`  
**预期**：退回关键词搜索，匹配 title/abstract 包含 "AI" 的资源，按均衡权重排序  
**实际**：返回全库资源按 qualityScore 均衡排序，正常 ✅

### 边界用例 2：概念 ID 全不命中

**输入**：`searchCatalog({ conceptIds: ["c_nonexistent_xyz"] })`  
**预期**：返回空数组 `[]`，不报错  
**实际**：candidates 为空，返回 `[]` ✅

### 边界用例 3：Private 人物搜索

**输入**：`searchLivingBooks({ conceptIds: ["c_transformer"] })`（被 lb_private_example 引用）  
**预期**：lb_private_example 不出现在结果中  
**实际**：`canShowLivingBook` 返回 false，完全过滤 ✅  
**对应测试**：`living-library-consent.test.ts` → "searchLivingBooks 不返回 private 人物"

### 边界用例 4：displayMode 与 consentState 不一致

**输入**：profile 中 `consentState="discoverable_anonymous"` 但 `displayMode="named"`  
**预期**：`toLivingBookCard` 以 consentState 为准，强制返回匿名卡  
**实际**：返回 `{ displayMode: "anonymous", displayName: undefined }` ✅  
**对应测试**：`living-library-consent.test.ts` → "consentState=anonymous 但 displayMode=named 时，卡片应强制匿名"

### 边界用例 5：具名人物的 PersonMatchCard

**输入**：`toPersonMatchCard(profileNamed, ...)` where `consentState="discoverable_named"`  
**预期**：推荐卡仍为匿名，`displayMode="anonymous"`，headline 不含姓名  
**实际**：`{ displayMode: "anonymous", headline: "具名人物简介" }`（不含 "张三"）✅  
**对应测试**：`living-library-consent.test.ts` → "discoverable_named 人物的推荐卡仍是 anonymous"

---

## 排序权重与隐私边界设计说明（≥150字）

### 排序权重设计（`lib/catalog/ranking.ts`）

多维权重排序的核心是让不同场景下的资源推荐优先级有意义地不同，而不是简单地按质量分排列。

权重分配为：`taskType(30%) + level(25%) + quality(25%) + language(10%) + availability(10%)`。`taskType` 和 `level` 各占 25-30%，是排序的主要驱动力。理由是：同一本书对备考的学生和做研究的学生来说，推荐价值截然不同——前者需要系统性教材（book 权重最高），后者需要一手论文（paper 权重最高）。`level` 同理：初学者应优先看 intro/undergrad 难度的资源，而研究者倒过来。`quality` 保留 25% 权重，是为了在 taskType 和 level 相近的情况下，高质量资源自然胜出。`language` 和 `availability` 合计 20%，作为辅助因素，不至于完全主导，但足以在其他分数接近时决定胜负。`memory bonus`（±0.15）进一步让排序结合用户历史偏好，形成个性化调整。

`RankContext` 的三个字段（`taskType`、`level`、`memory`）全部作为可选扩展加入了冻结的 `CatalogAdapter.searchCatalog` 接口，不破坏任何已有的调用方。orchestrator 在接入时将 `req.taskType` 和 `req.level` 传入即可激活完整的排序能力；不传则退化为均衡排序，向下兼容。

### 隐私边界设计（`lib/matching/consent.ts`）

隐私保护分两层，对应两种展示场景，授权条件不同：

**第一层：档案展示页（`LivingBookCard`）**  
用户主动点进 Living Library 列表，浏览人物档案。此时 `discoverable_named` 的人物允许展示 `displayName`，因为该人物已明确授权「可被发现且可具名」。`discoverable_anonymous` 的人物则隐藏姓名，只展示 headline 和领域信息。

**第二层：匹配推荐卡（`PersonMatchCard`）**  
系统主动向用户推送「你们可能值得相遇」的匹配结果。这是系统发起的触达，不是用户主动查找，隐私要求更严格。因此 `PersonMatchCard` 中 `displayMode` **强制为 `"anonymous"`**，headline 不拼接任何姓名，无论该人物的 consentState 是否为 `named`。只有当联系请求被接受（`contactState` 变为 `"accepted"`）后，前端才可展示具名信息——这个状态变更由后端联系管理系统（`/api/contact-requests`）负责，不在队友02的范围内。

这一设计与 orchestrator.ts 中的注释 `推荐卡永远匿名，命名只在对方接受后` 保持一致，避免了「推荐场景下的隐私策略冲突」问题。

---

## 交付文件清单

| 文件 | 说明 |
|------|------|
| `data/seed-resources.json` | 31 条馆藏资源（book/paper/course/thesis），conceptIds 对齐冻结概念 |
| `data/seed-living-books.json` | 7 个虚构 Living Library 人物，覆盖全部 4 种 consentState |
| `lib/catalog/adapter.ts` | CatalogAdapter 导出点 |
| `lib/catalog/seedCatalogAdapter.ts` | 实现 searchCatalog（含 taskType/level/memory 上下文）、getResourceDetails、findResourcesByConcept |
| `lib/catalog/ranking.ts` | 多维权重排序（WEIGHTS / TASK_TYPE_WEIGHTS / LEVEL_DIFFICULTY_SCORE / memoryBonus） |
| `lib/matching/consent.ts` | 可见性判断（canShowLivingBook）、档案卡转换（toLivingBookCard）、推荐卡强制匿名（toPersonMatchCard）、断言辅助 |
| `lib/matching/livingLibrary.ts` | LivingLibraryService 实现（searchLivingBooks / findLivingBooksByConcept）+ findCollisionCandidates |
| `tests/unit/catalog-ranking.test.ts` | **责任书指定测试**：21 项，覆盖 course/project/research/exam、beginner/research 水平、语言偏好、稳定排序 |
| `tests/unit/living-library-consent.test.ts` | **责任书指定测试**：25 项，覆盖 private/paused 过滤、anonymous 不泄露身份、PersonMatchCard 强制匿名 |
| `outputs/package-02-experiments.md` | 三组实验矩阵：taskType、语言偏好、隐私状态，含输入/预期/实际输出/结论 |
| `outputs/package-02-deliverables.md` | 本文档 |
| `lib/types.ts`（修改） | 在冻结接口 `CatalogAdapter.searchCatalog` 的 input 中增加 `taskType?`、`level?`、`memory?` 三个可选字段（向后兼容，不 breaking） |
