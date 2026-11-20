import { randomUUID } from "node:crypto";

const withId = (block) => ({
  ...block,
  id: block.id || randomUUID(),
});

export const normalizeBlocks = (blocks) => (blocks || []).map(withId);

export const normalizeExamPaper = (paper) => {
  const normalized = { ...paper };

  if (paper.instruction !== undefined) {
    normalized.instruction = normalizeBlocks(paper.instruction);
  }

  if (paper.sections !== undefined) {
    normalized.sections = paper.sections.map((section) => ({
      ...section,
      instruction:
        section.instruction === undefined
          ? undefined
          : normalizeBlocks(section.instruction),
    }));
  }

  return normalized;
};

const normalizeNode = (node) => ({
  ...node,
  id: node.id || randomUUID(),
  prompt: normalizeBlocks(node.prompt),
  explanation: normalizeBlocks(node.explanation),
  options: node.options?.map((option) => ({
    ...option,
    blocks: normalizeBlocks(option.blocks),
  })),
  answer: {
    ...(node.answer || {}),
    items: (node.answer?.items || []).map((item) => ({
      ...item,
      blocks: normalizeBlocks(item.blocks),
    })),
  },
  parts: node.parts?.map(normalizeNode),
});

export const normalizeQuestion = (question) => ({
  ...normalizeNode(question),
  instruction: normalizeBlocks(question.instruction),
  label:
    question.label ||
    `${question.sectionKey?.split("-")[0] || ""}${question.number}`,
});
