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

export function isWritingTemplateId(value: string | undefined): value is WritingTemplateId {
  return Boolean(value && writingTemplateIds.includes(value as WritingTemplateId));
}

export function writingTemplate(id: WritingTemplateId): WritingTemplate {
  return writingTemplates.find((template) => template.id === id) ?? writingTemplates[0];
}
