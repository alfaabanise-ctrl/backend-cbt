import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeExamPaper,
  normalizeQuestion,
} from "../utils/normalizeQuestion.js";
import {
  stripAnswers,
  stripLessonAnswerBlocks,
} from "../controllers/examController.js";
import ExamPaper from "../model/ExamPaper.js";
import ExamQuestion from "../model/ExamQuestion.js";

test("normalizes IDs throughout nested structured exam questions", () => {
  const question = normalizeQuestion({
    number: 1,
    sectionKey: "B-I",
    prompt: [{ type: "text", text: "Question stem" }],
    options: [{ label: "A", blocks: [{ type: "text", text: "Option" }] }],
    answer: {
      mode: "list",
      items: [{ blocks: [{ type: "text", text: "Answer" }] }],
    },
    parts: [
      {
        label: "a",
        prompt: [{ type: "image", mediaId: "0123456789abcdef01234567" }],
        parts: [{ label: "i", prompt: [{ type: "latex", text: "x^2" }] }],
      },
    ],
  });

  assert.equal(question.label, "B1");
  assert.ok(question.id);
  assert.ok(question.prompt[0].id);
  assert.ok(question.options[0].blocks[0].id);
  assert.ok(question.answer.items[0].blocks[0].id);
  assert.ok(question.parts[0].id);
  assert.ok(question.parts[0].prompt[0].id);
  assert.ok(question.parts[0].parts[0].id);
  assert.ok(question.parts[0].parts[0].prompt[0].id);
});

test("preserves existing stable IDs during normalization", () => {
  const question = normalizeQuestion({
    id: "question-1",
    number: 2,
    prompt: [{ id: "block-1", type: "text", text: "Prompt" }],
  });

  assert.equal(question.id, "question-1");
  assert.equal(question.prompt[0].id, "block-1");
});

test("adds stable IDs to paper and section instruction blocks", () => {
  const paper = normalizeExamPaper({
    instruction: [{ type: "text", text: "Answer every question." }],
    sections: [
      { key: "A", instruction: [{ type: "text", text: "Choose one." }] },
    ],
  });

  assert.ok(paper.instruction[0].id);
  assert.ok(paper.sections[0].instruction[0].id);
});

test("stores exam content in a Lesson-compatible mixed block list", async () => {
  const paper = new ExamPaper({
    examBody: "WAEC",
    subject: "Geography",
    subjectId: "geography",
    year: 2026,
    title: "WAEC Geography",
    slug: "waec-geography-blocks-test",
    blocks: [
      { type: "instruction", text: "Answer all questions." },
      { type: "question", number: 1, text: "Question prompt." },
      { type: "answer", text: "Answer text." },
    ],
  });

  await assert.doesNotReject(paper.validate());
  assert.equal(paper.blocks.length, 3);
});

test("validates HTML exam content without persisting an intermediate block list", async () => {
  const paper = new ExamPaper({
    examBody: "WAEC",
    subject: "Geography",
    subjectId: "geography",
    year: 2026,
    title: "WAEC Geography HTML",
    slug: "waec-geography-html-test",
    contentHtml: "<article><h2>Question 1</h2></article>",
    studentHtml: "<article><h2>Question 1</h2></article>",
    questionCount: 1,
  });

  await assert.doesNotReject(paper.validate());
  assert.equal(paper.contentHtml.includes("<article>"), true);
  assert.equal(paper.blocks, undefined);
  assert.equal(ExamPaper.schema.path("studentHtml").options.select, false);
});

test("strips answers and explanations recursively for student question responses", () => {
  const studentQuestion = stripAnswers({
    id: "q",
    answer: { mode: "single" },
    explanation: [{ type: "text", text: "Root explanation" }],
    parts: [
      {
        id: "part",
        answer: { mode: "single" },
        explanation: [{ type: "text", text: "Part explanation" }],
        parts: [{ id: "subpart", answer: { mode: "single" } }],
      },
    ],
  });

  assert.equal("answer" in studentQuestion, false);
  assert.equal("explanation" in studentQuestion, false);
  assert.equal("answer" in studentQuestion.parts[0], false);
  assert.equal("explanation" in studentQuestion.parts[0], false);
  assert.equal("answer" in studentQuestion.parts[0].parts[0], false);
});

test("strips answer blocks and answer fields from public lesson-style exam content", () => {
  const blocks = stripLessonAnswerBlocks([
    { type: "instruction", text: "Choose an option." },
    {
      type: "question",
      text: "What is 2 + 2?",
      correctOption: "B",
      options: [{ label: "A", text: "3" }, { label: "B", text: "4" }],
    },
    { type: "answer", text: "4", explanation: "Add the numbers." },
  ]);

  assert.equal(blocks.length, 2);
  assert.equal("correctOption" in blocks[1], false);
  assert.equal(blocks[1].options[1].text, "4");
});

test("allows an answer-only draft without question prompt content", async () => {
  const answerOnly = new ExamQuestion({
    paperId: "0123456789abcdef01234567",
    number: 2,
    sectionKey: "B-I",
    id: "answer-draft",
    prompt: [],
    answerOnly: true,
    answer: {
      mode: "single",
      items: [{ blocks: [{ id: "answer-block", type: "text", text: "Answer" }] }],
    },
  });

  await assert.doesNotReject(answerOnly.validate());
});
