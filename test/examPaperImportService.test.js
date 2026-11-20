import assert from "node:assert/strict";
import test from "node:test";
import {
  collectExamImageIndexes,
  renderExamPaperHtml,
  retryTransientAIRequest,
  resolveExamImageIndexes,
  validateExamPaperImportResult,
} from "../services/ai/examPaperImportService.js";

const metadata = {
  examBody: "WAEC",
  subject: "Geography",
  subjectId: "geography",
  year: 2026,
  paperType: "theory",
  durationMinutes: 0,
  status: "draft",
};

const baseResult = {
  title: "WAEC Geography 2026",
  durationMinutes: 90,
  blocks: [
    { type: "instruction", title: "Instructions", text: "Answer all questions." },
    { type: "heading", level: 2, text: "Section A" },
    {
      type: "question",
      title: "Question 1",
      number: 1,
      text: "Explain the water cycle.",
      marks: 5,
    },
    {
      type: "answer",
      title: "Answer",
      text: "Water evaporates, condenses, and falls as precipitation.",
      explanation: "This describes the main stages of the water cycle.",
    },
  ],
};

test("retries a transient provider overload and returns the successful response", async () => {
  let attempts = 0;
  const delays = [];
  const result = await retryTransientAIRequest(
    async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("Overloaded"), { status: 503 });
      return "ok";
    },
    { delay: async (milliseconds) => delays.push(milliseconds) },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [1000]);
});

test("does not retry non-transient provider errors", async () => {
  let attempts = 0;

  await assert.rejects(
    retryTransientAIRequest(async () => {
      attempts += 1;
      throw Object.assign(new Error("Invalid API key"), { status: 401 });
    }),
    /Invalid API key/,
  );
  assert.equal(attempts, 1);
});

test("validates an ordered Lesson-compatible block list and subject reference", () => {
  const draft = validateExamPaperImportResult(
    {
      ...baseResult,
      blocks: [
        ...baseResult.blocks,
        { type: "paragraph", text: "<script>alert(1)</script>" },
      ],
    },
    metadata,
    0,
  );

  assert.equal(draft.title, "WAEC Geography 2026");
  assert.equal(draft.slug, "waec-geography-2026");
  assert.equal(draft.metadata.durationMinutes, 90);
  assert.equal(draft.metadata.subjectId, "geography");
  assert.deepEqual(
    draft.blocks.map((block) => block.type),
    ["instruction", "heading", "question", "answer", "paragraph"],
  );
  assert.equal(draft.blocks[4].text, "<script>alert(1)</script>");
});

test("renders safe semantic HTML and omits answer blocks from student HTML", () => {
  const draft = validateExamPaperImportResult(
    {
      ...baseResult,
      blocks: [
        { type: "instruction", text: "Read carefully." },
        { type: "question", number: 1, text: "<script>alert(1)</script>" },
        { type: "image", imageIndex: 0, caption: "Map" },
        { type: "answer", text: "Private model answer.", explanation: "Private reasoning." },
      ],
    },
    metadata,
    1,
  );
  const studentHtml = renderExamPaperHtml(draft.blocks, { includeAnswers: false });

  assert.match(draft.contentHtml, /<section class="exam-instructions">/);
  assert.match(draft.contentHtml, /<article class="exam-question">/);
  assert.match(draft.contentHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(draft.contentHtml, /data-image-index="0"/);
  assert.doesNotMatch(draft.contentHtml, /<script>/);
  assert.doesNotMatch(studentHtml, /Private model answer|Private reasoning|class="exam-answer"/);
});

test("escapes image attributes when rendering HTML", () => {
  const html = renderExamPaperHtml([
    {
      type: "image",
      src: 'https://cdn.test/image.png" onerror="alert(1)',
      alt: 'Map" onerror="alert(1)',
    },
  ]);

  assert.match(html, /src="https:\/\/cdn\.test\/image\.png%22%20onerror=%22alert\(1\)"/);
  assert.doesNotMatch(html, /"\s+onerror\s*=/);
});

test("renders supporting block fields while keeping quiz answers private for students", () => {
  const blocks = [
    { type: "checklist", items: [{ text: "Read the map" }] },
    { type: "steps", title: "Method", items: [{ text: "Measure the distance" }] },
    { type: "quiz", questions: [{ question: "Choose one", options: { A: "First", B: "Second" }, answer: "B" }] },
    { type: "video", url: "javascript:alert(1)", title: "Unsafe source" },
  ];
  const studentHtml = renderExamPaperHtml(blocks, { includeAnswers: false });
  const adminHtml = renderExamPaperHtml(blocks);

  assert.match(studentHtml, /Read the map/);
  assert.match(studentHtml, /Measure the distance/);
  assert.match(studentHtml, /Choose one/);
  assert.match(studentHtml, /First/);
  assert.doesNotMatch(studentHtml, /<strong>Answer:<\/strong>|>B</);
  assert.doesNotMatch(studentHtml, /javascript:/);
  assert.match(adminHtml, /<strong>Answer:<\/strong> B/);
});

test("rejects legacy section-and-question payloads instead of storing split records", () => {
  assert.throws(
    () =>
      validateExamPaperImportResult(
        {
          title: "Paper",
          sections: [{ key: "A" }],
          questions: [{ number: 1 }],
        },
        metadata,
        0,
      ),
    /content blocks/,
  );
});

test("rejects image references that do not match uploaded images", () => {
  assert.throws(
    () =>
      validateExamPaperImportResult(
        {
          ...baseResult,
          blocks: [
            ...baseResult.blocks,
            { type: "image", imageIndex: 1, caption: "Map" },
          ],
        },
        metadata,
        1,
      ),
    /refers to an image that was not uploaded/,
  );
});

test("resolves image indexes recursively to lesson image source and media reference", () => {
  const source = {
    blocks: [{ type: "image", imageIndex: 0, caption: "Map" }],
  };
  const mediaIds = new Map([
    [0, { mediaId: "media-0", src: "https://cdn.test/map.png", alt: "Map alt" }],
  ]);
  const resolved = resolveExamImageIndexes(source, mediaIds);

  assert.deepEqual([...collectExamImageIndexes(source)], [0]);
  assert.equal(resolved.blocks[0].mediaId, "media-0");
  assert.equal(resolved.blocks[0].src, "https://cdn.test/map.png");
  assert.equal(resolved.blocks[0].alt, "Map alt");
});

test("rejects unknown lesson block types and missing question content", () => {
  assert.throws(
    () =>
      validateExamPaperImportResult(
        { blocks: [{ type: "section", title: "A" }] },
        metadata,
        0,
      ),
    /unsupported learning block type/,
  );
  assert.throws(
    () => validateExamPaperImportResult({ blocks: [{ type: "heading", text: "A" }] }, metadata, 0),
    /no question or answer blocks/,
  );
});
