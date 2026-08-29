export const writingTemplateIds = [
  "evidence_section",
  "literature_review",
  "outline",
  "source_to_paper",
] as const;

export type WritingTemplateId = typeof writingTemplateIds[number];

export type WritingTemplate = {
  id: WritingTemplateId;
  name: string;
  description: string;
  focusPlaceholder: string;
};

export const writingTemplates: readonly WritingTemplate[] = [
  {
    id: "evidence_section",
    name: "证据约束章节",
    description: "把已核验文献整理为一节带回链的论述。",
    focusPlaceholder: "本节焦点，例如：比较混合检索的评估方法",
  },
  {
    id: "literature_review",
    name: "文献综述",
    description: "围绕研究问题综合已核验来源，并保留逐句证据标记。",
    focusPlaceholder: "综述主题，例如：生成式人工智能辅助学习的研究脉络",
  },
  {
    id: "outline",
    name: "论文大纲",
    description: "先生成可审阅的证据驱动大纲，再进入正文写作。",
    focusPlaceholder: "论文或报告题目",
  },
  {
    id: "source_to_paper",
    name: "资料到论文",
    description: "从选定资料与已核验文献开始搭建论文初稿。",
    focusPlaceholder: "论文主题或待完成的写作任务",
  },
] as const;

export type WorkflowCatalogCategory = "research" | "academic" | "assets";
export type WorkflowCatalogTemplate = {
  id: string;
  name: string;
  category: WorkflowCatalogCategory;
  description: string;
  stages: string[];
  outputs: string[];
  checkpoints: number;
  runnerTemplateId: WritingTemplateId;
  availability: "ready" | "evidence_fallback";
};

/**
 * The full workflow directory is intentionally kept as a catalogue separate
 * from the four evidence-runner templates. This preserves the complete
 * workflow selection surface without claiming that a browser-only runner can
 * execute local code, compile PDFs, or draw figures.
 */
export const workflowCatalog: readonly WorkflowCatalogTemplate[] = [
  { id: "evidence_section", name: "证据约束章节", category: "research", description: "把已核验文献整理为一节带回链的论述。", stages: ["材料", "证据篮", "初稿", "人工复核"], outputs: ["draft.md", "citations.json"], checkpoints: 1, runnerTemplateId: "evidence_section", availability: "ready" },
  { id: "idea_discovery", name: "Idea 发现", category: "research", description: "从研究问题、馆藏和个人知识图谱中提炼可验证的研究方向。", stages: ["文献调研", "Idea 生成", "新颖性验证", "外部评审", "方法精炼"], outputs: ["literature_review.md", "references.bib", "IDEA_REPORT.md"], checkpoints: 0, runnerTemplateId: "literature_review", availability: "ready" },
  { id: "auto_review", name: "自动审稿循环", category: "research", description: "围绕已确认来源生成初稿，审阅后反馈并重跑当前步骤。", stages: ["审稿意见", "修改建议", "改进循环"], outputs: ["NARRATIVE_REPORT.md", "AUTO_REVIEW.md"], checkpoints: 1, runnerTemplateId: "evidence_section", availability: "ready" },
  { id: "literature_review", name: "文献综述", category: "research", description: "检索、核验并综合来源，保留证据回链。", stages: ["文献检索", "证据核验", "综述撰写", "人工复核"], outputs: ["papers_pool.md", "LITERATURE_REVIEW.md"], checkpoints: 1, runnerTemplateId: "literature_review", availability: "ready" },
  { id: "experiment_bridge", name: "实验桥接", category: "research", description: "把研究问题和已有材料整理成实验计划与可交接的结果说明。", stages: ["材料清点", "实验规划", "结果说明"], outputs: ["experiment_results.md"], checkpoints: 1, runnerTemplateId: "source_to_paper", availability: "evidence_fallback" },
  { id: "paper_writing", name: "论文写作", category: "academic", description: "从证据、提纲到正文，适合完整的学术写作流程。", stages: ["文献调研", "论文大纲", "方法与证据", "图表规划", "论文写作", "人工复核"], outputs: ["PAPER_PLAN.md", "RESULTS.md", "paper/main.tex"], checkpoints: 2, runnerTemplateId: "source_to_paper", availability: "evidence_fallback" },
  { id: "paper_writing_zh", name: "中文论文写作", category: "academic", description: "中文论文的证据驱动大纲、论证和正文草稿。", stages: ["中文大纲", "证据整理", "论文写作", "人工复核"], outputs: ["PAPER_PLAN.md", "paper/main.tex"], checkpoints: 2, runnerTemplateId: "source_to_paper", availability: "ready" },
  { id: "nature_writing", name: "Nature 论文写作", category: "academic", description: "按高影响力期刊的结构要求整理论点、证据与叙事。", stages: ["论文规划", "数据与证据", "图表规划", "Nature 写作", "改进循环"], outputs: ["PAPER_PLAN.md", "paper/main.tex"], checkpoints: 2, runnerTemplateId: "source_to_paper", availability: "evidence_fallback" },
  { id: "thesis_proposal", name: "开题报告", category: "academic", description: "从研究背景、文献缺口到研究方案形成可审阅开题稿。", stages: ["文献调研", "研究方案", "格式检查"], outputs: ["literature_notes.md", "PROPOSAL.md"], checkpoints: 1, runnerTemplateId: "literature_review", availability: "ready" },
  { id: "course_paper", name: "课程论文", category: "academic", description: "将课程要求和可靠来源组织为课程论文初稿。", stages: ["大纲规划", "数据与证据", "论文撰写", "格式检查"], outputs: ["OUTLINE.md", "COURSE_PAPER.md"], checkpoints: 1, runnerTemplateId: "source_to_paper", availability: "evidence_fallback" },
  { id: "course_report", name: "课程报告", category: "academic", description: "提取事实、规划结构并生成带来源的课程报告。", stages: ["事实提取", "大纲规划", "报告撰写", "格式检查"], outputs: ["PROJECT_FACTS.md", "COURSE_REPORT.md"], checkpoints: 1, runnerTemplateId: "source_to_paper", availability: "evidence_fallback" },
  { id: "paper_from_assets", name: "已有资产到论文", category: "assets", description: "先清点你上传的资料，再将资料与馆藏证据汇入论文结构。", stages: ["资产清点", "论文规划", "缺口识别", "论文撰写"], outputs: ["ASSETS_INVENTORY.md", "PAPER_PLAN.md", "paper/main.tex"], checkpoints: 2, runnerTemplateId: "source_to_paper", availability: "ready" },
  { id: "full_pipeline", name: "全流程", category: "research", description: "从文献调研、Idea、实验规划到论文产物的完整编排入口。", stages: ["文献调研", "Idea", "新颖性", "实验规划", "大纲", "写作", "改进"], outputs: ["literature_review.md", "PAPER_PLAN.md", "paper/main.tex"], checkpoints: 2, runnerTemplateId: "source_to_paper", availability: "evidence_fallback" },
  { id: "grad_project", name: "一句话生成项目", category: "academic", description: "从一句项目描述开始，形成方案、实施计划和项目说明。", stages: ["需求梳理", "实施设计", "项目说明", "人工复核"], outputs: ["PROJECT_PLAN.md", "IMPLEMENTATION_PLAN.md"], checkpoints: 1, runnerTemplateId: "outline", availability: "ready" },
  { id: "copyright_material", name: "软件著作权材料", category: "assets", description: "整理软件功能、业务流程与申请材料结构。", stages: ["功能梳理", "材料撰写", "格式检查"], outputs: ["SOFTWARE_PROFILE.md", "COPYRIGHT_MATERIALS.docx"], checkpoints: 1, runnerTemplateId: "outline", availability: "evidence_fallback" },
  { id: "patent_disclosure", name: "专利技术交底书", category: "assets", description: "从技术方案和保护点出发组织交底书初稿。", stages: ["技术方案", "保护点", "交底书撰写", "格式检查"], outputs: ["TECHNICAL_PLAN.md", "PATENT_DISCLOSURE.docx"], checkpoints: 1, runnerTemplateId: "source_to_paper", availability: "evidence_fallback" },
];

export function workflowCatalogTemplate(id: string | undefined): WorkflowCatalogTemplate {
  return workflowCatalog.find((template) => template.id === id)
    ?? workflowCatalog.find((template) => template.id === "literature_review")!;
}

export function isWritingTemplateId(value: string | undefined): value is WritingTemplateId {
  return Boolean(value && writingTemplateIds.includes(value as WritingTemplateId));
}

export function writingTemplate(id: WritingTemplateId): WritingTemplate {
  return writingTemplates.find((template) => template.id === id) ?? writingTemplates[0];
}
