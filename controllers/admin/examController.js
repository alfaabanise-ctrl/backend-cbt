import mongoose from "mongoose";
import ExamMedia from "../../model/ExamMedia.js";
import ExamPaper from "../../model/ExamPaper.js";
import ExamQuestion from "../../model/ExamQuestion.js";
import cloudinary from "../../config/cloudinary.js";
import { uploadImage } from "../../utils/cloudinaryUpload.js";
import {
  normalizeExamPaper,
  normalizeQuestion,
} from "../../utils/normalizeQuestion.js";
import { assertMediaExists } from "../../utils/examMedia.js";

const paperFields = [
  "examBody",
  "subject",
  "subjectId",
  "year",
  "paperType",
  "title",
  "slug",
  "instruction",
  "durationMinutes",
  "sections",
  "status",
];

const mediaFields = [
  "url",
  "publicId",
  "alt",
  "width",
  "height",
  "mime",
];

const pickFields = (source, fields) =>
  Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
      .map((field) => [field, source[field]])
  );

const handleError = (res, error, action) => {
  console.error(`${action}:`, error);
  const status =
    error.statusCode ||
    (error.name === "ValidationError" || error.name === "CastError"
      ? 400
      : error.code === 11000
        ? 409
        : 500);
  return res.status(status).json({
    success: false,
    message:
      status === 400 || status === 409
        ? error.message
        : `Failed to ${action}.`,
  });
};

const validId = (value) => mongoose.isValidObjectId(value);

const hasQuestionContent = (node) =>
  (node.prompt || []).some(
    (block) =>
      block.type === "image" ||
      block.type === "table" ||
      block.type === "svg" ||
      Boolean(block.text?.trim())
  ) || (node.parts || []).some(hasQuestionContent);

const hasAnswerContent = (answer) =>
  answer?.mode === "option"
    ? Boolean(answer.correctOption)
    : answer?.mode !== "none" && Boolean(answer?.items?.length);

export const listExamPapers = async (req, res) => {
  try {
    const filter = {};
    for (const field of ["examBody", "subject", "subjectId", "year", "paperType", "status"]) {
      if (req.query[field] !== undefined) filter[field] = req.query[field];
    }
    const papers = await ExamPaper.find(filter)
      .select("-contentHtml -studentHtml")
      .sort({ year: -1, examBody: 1, subject: 1, paperType: 1 })
      .lean();
    return res.json({ success: true, count: papers.length, data: papers });
  } catch (error) {
    return handleError(res, error, "load exam papers");
  }
};

export const getExamPaper = async (req, res) => {
  try {
    if (!validId(req.params.paperId)) {
      return res.status(400).json({ success: false, message: "Invalid paper ID." });
    }
    const paper = await ExamPaper.findById(req.params.paperId).lean();
    if (!paper) {
      return res.status(404).json({ success: false, message: "Exam paper not found." });
    }
    return res.json({ success: true, data: paper });
  } catch (error) {
    return handleError(res, error, "load exam paper");
  }
};

export const createExamPaper = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: "A paper object is required." });
    }
    const body = normalizeExamPaper(req.body);
    await assertMediaExists(body);
    const paper = await ExamPaper.create(pickFields(body, paperFields));
    return res.status(201).json({ success: true, data: paper });
  } catch (error) {
    return handleError(res, error, "create exam paper");
  }
};

export const updateExamPaper = async (req, res) => {
  try {
    if (!validId(req.params.paperId)) {
      return res.status(400).json({ success: false, message: "Invalid paper ID." });
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: "A paper object is required." });
    }
    const body = normalizeExamPaper(req.body);
    const update = pickFields(body, paperFields);
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: "At least one paper field is required." });
    }
    await assertMediaExists(body);
    const paper = await ExamPaper.findByIdAndUpdate(
      req.params.paperId,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!paper) {
      return res.status(404).json({ success: false, message: "Exam paper not found." });
    }
    return res.json({ success: true, data: paper });
  } catch (error) {
    return handleError(res, error, "update exam paper");
  }
};

export const deleteExamPaper = async (req, res) => {
  try {
    if (!validId(req.params.paperId)) {
      return res.status(400).json({ success: false, message: "Invalid paper ID." });
    }
    const questionExists = await ExamQuestion.exists({ paperId: req.params.paperId });
    if (questionExists) {
      return res.status(409).json({
        success: false,
        message: "Delete or move this paper's questions before deleting the paper.",
      });
    }
    const paper = await ExamPaper.findByIdAndDelete(req.params.paperId);
    if (!paper) {
      return res.status(404).json({ success: false, message: "Exam paper not found." });
    }
    return res.json({ success: true, message: "Exam paper deleted." });
  } catch (error) {
    return handleError(res, error, "delete exam paper");
  }
};

export const listExamQuestions = async (req, res) => {
  try {
    if (req.query.paperId && !validId(req.query.paperId)) {
      return res.status(400).json({ success: false, message: "Invalid paper ID." });
    }
    const filter = {};
    if (req.query.paperId) filter.paperId = req.query.paperId;
    if (req.query.sectionKey) filter.sectionKey = req.query.sectionKey;
    const questions = await ExamQuestion.find(filter)
      .sort({ paperId: 1, orderIndex: 1, sectionKey: 1, number: 1 })
      .lean();
    return res.json({ success: true, count: questions.length, data: questions });
  } catch (error) {
    return handleError(res, error, "load exam questions");
  }
};

export const listExamMedia = async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 100, 1),
      500
    );
    const [media, total] = await Promise.all([
      ExamMedia.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ExamMedia.countDocuments(),
    ]);
    return res.json({
      success: true,
      data: media,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleError(res, error, "load exam media");
  }
};

export const getExamMedia = async (req, res) => {
  try {
    if (!validId(req.params.mediaId)) {
      return res.status(400).json({ success: false, message: "Invalid media ID." });
    }
    const media = await ExamMedia.findById(req.params.mediaId).lean();
    if (!media) {
      return res.status(404).json({ success: false, message: "Exam media not found." });
    }
    return res.json({ success: true, data: media });
  } catch (error) {
    return handleError(res, error, "load exam media");
  }
};

export const createExamQuestion = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: "A question object is required." });
    }
    const question = normalizeQuestion(req.body);
    if (!validId(question.paperId)) {
      return res.status(400).json({ success: false, message: "A valid paperId is required." });
    }
    if (!(await ExamPaper.exists({ _id: question.paperId }))) {
      return res.status(400).json({ success: false, message: "The specified exam paper does not exist." });
    }
    await assertMediaExists(question);
    const existing = await ExamQuestion.findOne({
      paperId: question.paperId,
      sectionKey: question.sectionKey || "",
      number: question.number,
    });
    if (existing) {
      if (!existing.answerOnly) {
        return res.status(409).json({
          success: false,
          message: "A question already exists for this section and number.",
        });
      }
      if (!hasAnswerContent(question.answer)) question.answer = existing.answer;
      question.id = existing.id;
      question.answerOnly = !hasQuestionContent(question);
      existing.set(question);
      const merged = await existing.save();
      return res.status(200).json({ success: true, data: merged });
    }
    question.answerOnly = !hasQuestionContent(question);
    const created = await ExamQuestion.create(question);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return handleError(res, error, "create exam question");
  }
};

export const updateExamQuestion = async (req, res) => {
  try {
    if (!validId(req.params.questionId)) {
      return res.status(400).json({ success: false, message: "Invalid question ID." });
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: "A question object is required." });
    }
    const question = normalizeQuestion(req.body);
    if (!validId(question.paperId)) {
      return res.status(400).json({ success: false, message: "A valid paperId is required." });
    }
    if (!(await ExamPaper.exists({ _id: question.paperId }))) {
      return res.status(400).json({ success: false, message: "The specified exam paper does not exist." });
    }
    await assertMediaExists(question);
    const existing = await ExamQuestion.findById(req.params.questionId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Exam question not found." });
    }
    existing.set(question);
    existing.answerOnly = !hasQuestionContent(question);
    const updated = await existing.save();
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "update exam question");
  }
};

export const createOrUpdateExamAnswer = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: "An answer object is required." });
    }
    const { paperId, sectionKey = "", number, answer, kind = "structured" } = req.body;
    if (!validId(paperId)) {
      return res.status(400).json({ success: false, message: "A valid paperId is required." });
    }
    if (!Number.isInteger(Number(number)) || Number(number) < 1) {
      return res.status(400).json({ success: false, message: "A positive question number is required." });
    }
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
      return res.status(400).json({ success: false, message: "An answer value is required." });
    }
    if (!(await ExamPaper.exists({ _id: paperId }))) {
      return res.status(400).json({ success: false, message: "The specified exam paper does not exist." });
    }
    await assertMediaExists(answer);

    const normalizedAnswer = normalizeQuestion({ answer }).answer;
    const question = await ExamQuestion.findOne({
      paperId,
      sectionKey: String(sectionKey),
      number: Number(number),
    });

    if (question) {
      question.answer = normalizedAnswer;
      question.answerOnly = !hasQuestionContent(question.toObject());
      const updated = await question.save();
      return res.json({ success: true, data: updated });
    }

    const answerOnlyQuestion = normalizeQuestion({
      paperId,
      sectionKey: String(sectionKey),
      number: Number(number),
      kind,
      prompt: [],
      answer: normalizedAnswer,
      answerOnly: true,
    });
    const created = await ExamQuestion.create(answerOnlyQuestion);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return handleError(res, error, "save exam answer");
  }
};

export const updateExamAnswer = async (req, res) => {
  try {
    if (!validId(req.params.questionId)) {
      return res.status(400).json({ success: false, message: "Invalid question ID." });
    }
    if (!req.body?.answer || typeof req.body.answer !== "object" || Array.isArray(req.body.answer)) {
      return res.status(400).json({ success: false, message: "An answer value is required." });
    }
    const question = await ExamQuestion.findById(req.params.questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: "Exam question not found." });
    }
    await assertMediaExists(req.body.answer);
    question.answer = normalizeQuestion({ answer: req.body.answer }).answer;
    question.answerOnly = !hasQuestionContent(question.toObject());
    const updated = await question.save();
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "update exam answer");
  }
};

export const deleteExamQuestion = async (req, res) => {
  try {
    if (!validId(req.params.questionId)) {
      return res.status(400).json({ success: false, message: "Invalid question ID." });
    }
    const question = await ExamQuestion.findByIdAndDelete(req.params.questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: "Exam question not found." });
    }
    return res.json({ success: true, message: "Exam question deleted." });
  } catch (error) {
    return handleError(res, error, "delete exam question");
  }
};

export const createExamMedia = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: "A media object is required." });
    }
    const media = await ExamMedia.create({
      ...pickFields(req.body, mediaFields),
      uploadedBy: String(req.user._id),
    });
    return res.status(201).json({ success: true, data: media });
  } catch (error) {
    return handleError(res, error, "create exam media");
  }
};

export const uploadExamMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "An image file is required.",
      });
    }

    const mediaId = req.body?.mediaId;
    let existing = null;
    if (mediaId) {
      if (!validId(mediaId)) {
        return res.status(400).json({ success: false, message: "Invalid media ID." });
      }
      existing = await ExamMedia.findById(mediaId);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Exam media not found." });
      }
    }

    const uploaded = await uploadImage(req.file, "exam-media");
    const mediaData = {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      alt: existing?.alt || "",
      width: uploaded.width,
      height: uploaded.height,
      mime: req.file.mimetype,
      uploadedBy: String(req.user._id),
    };

    let media;
    try {
      media = existing
        ? await ExamMedia.findByIdAndUpdate(existing._id, { $set: mediaData }, {
            new: true,
            runValidators: true,
          })
        : await ExamMedia.create(mediaData);
    } catch (error) {
      await cloudinary.uploader.destroy(uploaded.public_id);
      throw error;
    }

    if (existing?.publicId && existing.publicId !== uploaded.public_id) {
      try {
        await cloudinary.uploader.destroy(existing.publicId);
      } catch (error) {
        console.error("Could not remove replaced exam media asset:", error);
      }
    }

    return res.status(existing ? 200 : 201).json({ success: true, data: media });
  } catch (error) {
    return handleError(res, error, "upload exam media");
  }
};

export const updateExamMedia = async (req, res) => {
  try {
    if (!validId(req.params.mediaId)) {
      return res.status(400).json({ success: false, message: "Invalid media ID." });
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: "A media object is required." });
    }
    const update = pickFields(req.body, mediaFields);
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: "At least one media field is required." });
    }
    const media = await ExamMedia.findByIdAndUpdate(
      req.params.mediaId,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!media) {
      return res.status(404).json({ success: false, message: "Exam media not found." });
    }
    return res.json({ success: true, data: media });
  } catch (error) {
    return handleError(res, error, "update exam media");
  }
};
