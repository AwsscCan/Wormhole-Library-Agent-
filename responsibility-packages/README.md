# Wormhole Library Agent 三人责任包索引

适用队伍：三人团队，其中你包含在三人之中。  
分配模式：你负责架构整合与 Demo 闭环；两名队友分别负责资源层和算法记忆层。  
总设计文档：`../wormhole-library-agent-claude-code-design-zh.md`

## 分工总览

| 成员 | 责任包 | 一句话目标 | 子文档 |
|---|---|---|---|
| 你 | 架构整合、主应用骨架、Demo harness、验收统筹 | 把三块能力合成一个能跑、能讲、能验收的图书馆 Agent | `package-01-owner-integration.md` |
| 队友一 | 图书馆资源层、馆藏 grounding、Living Library 数据与隐私流程 | 保证所有推荐都落到书、论文、课程、书架或人 | `package-02-library-grounding-living-library.md` |
| 队友二 | 虫洞算法、Unknown Unknowns、意外度滑块、反馈记忆 | 保证“意外”可控、可解释，并且会被反馈改变 | `package-03-wormhole-memory-algorithm.md` |

## 接口冻结原则

三人并行开发前先冻结这些对象：

```ts
type ResourceCard = {
  id: string;
  title: string;
  type: "book" | "paper" | "course" | "thesis";
  why: string;
  location?: string;
  availability: "available" | "checked_out" | "online" | "unknown";
  difficulty: "intro" | "undergrad" | "graduate" | "research";
  conceptIds: string[];
};

type WormholeCard = {
  id: string;
  path: string[];
  explanation: string;
  resourceIds: string[];
  livingBookIds: string[];
  scores: {
    novelty: number;
    bridge: number;
    quality: number;
    final: number;
  };
};

type PersonMatchCard = {
  id: string;
  displayMode: "anonymous" | "named";
  headline: string;
  bridge: string[];
  collisionReason: string;
  contactState: "request_required" | "pending" | "accepted" | "rejected";
};
```

接口冻结后，任何字段改动都必须同步改 seed、API、前端组件和测试。

## 每日同步节奏

| 时间 | 你要收什么 |
|---|---|
| 上午 | 每个人当天目标、涉及文件、预计接口变化 |
| 中午 | 最小可运行结果，不接受只有截图或口头描述 |
| 晚上 | patch、运行命令、测试结果、失败样例、明日风险 |

## 最终交付物

1. 可运行项目。
2. 总设计文档。
3. 三份责任子文档。
4. README。
5. Demo 脚本。
6. 测试结果。
7. 每名成员的独立交付说明。

