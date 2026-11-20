import mongoose from "mongoose";
import ExamPaper from "../model/ExamPaper.js";
import ExamQuestion from "../model/ExamQuestion.js";
import { resolveMedia } from "../utils/examMedia.js";
import { renderExamPaperHtml } from "../services/ai/examPaperImportService.js";

export const stripAnswers = (node) => {
  const { answer, explanation, ...question } = node;
  if (question.parts) question.parts = question.parts.map(stripAnswers);
  return question;
};

function stripLessonAnswerValue(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item?.type !== "answer")
      .map(stripLessonAnswerValue);
  }
  if (!value || typeof value !== "object") return value;
  if (value instanceof mongoose.Types.ObjectId || value instanceof Date) return value;
  if (value.type === "answer") return undefined;

  const safeValue = {};
  for (const [key, child] of Object.entries(value)) {
    if (
      ["answer", "answerKey", "correctAnswer", "correctOption", "explanation", "solution"].includes(
        key,
      )
    ) {
      continue;
    }
    const safeChild = stripLessonAnswerValue(child);
    if (safeChild !== undefined) safeValue[key] = safeChild;
  }
  return safeValue;
}

export const stripLessonAnswerBlocks = (blocks = []) =>
  stripLessonAnswerValue(blocks);

export const listPublishedExamPapers = async (req, res) => {
  try {
    const filter = { status: "published" };
    for (const field of ["examBody", "subject", "subjectId", "year", "paperType"]) {
      if (req.query[field] !== undefined) filter[field] = req.query[field];
    }
    const papers = await ExamPaper.find(filter)
      .select("-__v -contentHtml -studentHtml -blocks -instruction -sections")
      .sort({ year: -1, examBody: 1, subject: 1, paperType: 1 })
      .lean();
    return res.json({ success: true, count: papers.length, data: papers });
  } catch (error) {
    console.error("listPublishedExamPapers:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load exam papers.",
    });
  }
};

export const getPublishedExamQuestions = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.paperId)) {
      return res.status(400).json({ success: false, message: "Invalid paper ID." });
    }
    const paper = await ExamPaper.findOne({
      _id: req.params.paperId,
      status: "published",
    })
      .select(
        "_id title examBody subject subjectId year paperType contentHtml +studentHtml blocks instruction durationMinutes sections questionCount",
      )
      .lean();
    if (!paper) {
      return res.status(404).json({ success: false, message: "Published exam paper not found." });
    }

    const hasHtmlContent = Boolean(paper.contentHtml);
    const hasLessonBlocks = Array.isArray(paper.blocks) && paper.blocks.length > 0;
    const filter = { paperId: paper._id, answerOnly: { $ne: true } };
    if (req.query.sectionKey) filter.sectionKey = req.query.sectionKey;
    const questions = hasHtmlContent || hasLessonBlocks
      ? []
      : await ExamQuestion.find(filter)
          .select("-answer -explanation -__v")
          .sort({ orderIndex: 1, sectionKey: 1, number: 1 })
          .lean();

    const safeQuestions = questions.map(stripAnswers);
    const publicPaper = { ...paper };
    if (hasHtmlContent) {
      publicPaper.contentHtml = paper.studentHtml || "";
      delete publicPaper.studentHtml;
      delete publicPaper.blocks;
      delete publicPaper.instruction;
      delete publicPaper.sections;
    } else if (hasLessonBlocks) {
      publicPaper.blocks = stripLessonAnswerBlocks(paper.blocks);
    } else {
      delete publicPaper.studentHtml;
    }
    const [resolvedPaper, resolvedQuestions] = await Promise.all([
      resolveMedia(publicPaper),
      resolveMedia(safeQuestions),
    ]);

    return res.json({
      success: true,
      paper: resolvedPaper,
      count: hasHtmlContent
        ? paper.questionCount || 0
        : hasLessonBlocks
        ? paper.blocks.filter((block) => block.type === "question").length
        : resolvedQuestions.length,
      data: resolvedQuestions,
    });
  } catch (error) {
    console.error("getPublishedExamQuestions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load exam questions.",
    });
  }
};
