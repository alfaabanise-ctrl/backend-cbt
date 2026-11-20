import mongoose from "mongoose";
import cloudinary from "../../config/cloudinary.js";
import ExamMedia from "../../model/ExamMedia.js";
import ExamPaper from "../../model/ExamPaper.js";
import { Subject } from "../../model/Subject.js";
import {
  collectExamImageIndexes,
  ExamPaperImportError,
  generateExamPaperImport,
  renderExamPaperHtml,
  resolveExamImageIndexes,
  validateExamPaperImportResult,
} from "../../services/ai/examPaperImportService.js";
import { assertMediaExists } from "../../utils/examMedia.js";
import { uploadImage } from "../../utils/cloudinaryUpload.js";

const EXAM_BODIES = new Set(["WAEC", "NECO", "NABTEB", "JAMB", "OTHER"]);
const PAPER_TYPES = new Set(["objective", "theory", "practical", "mixed"]);
const MAX_TEXT_LENGTH = 200_000;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

async function readMetadata(body) {
  const examBody = typeof body.examBody === "string" ? body.examBody.trim() : "";
  const requestedSubjectId =
    typeof body.subjectId === "string" ? body.subjectId.trim() : "";
  const requestedSubject = typeof body.subject === "string" ? body.subject.trim() : "";
  const paperType = typeof body.paperType === "string" ? body.paperType : "";
  const year = Number(body.year);
  const durationMinutes = Number(body.durationMinutes ?? 0);

  if (!EXAM_BODIES.has(examBody)) {
    throw new ExamPaperImportError("Select a valid examination body.", { statusCode: 400 });
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new ExamPaperImportError("Enter a valid exam year.", { statusCode: 400 });
  }
  if (!PAPER_TYPES.has(paperType)) {
    throw new ExamPaperImportError("Select a valid paper type.", { statusCode: 400 });
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
    throw new ExamPaperImportError("Duration must be zero or a positive number.", {
      statusCode: 400,
    });
  }

  const subjectFilter = requestedSubjectId
    ? { subjectId: requestedSubjectId }
    : requestedSubject
      ? { name: new RegExp(`^${requestedSubject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
      : null;
  const subject = subjectFilter
    ? await Subject.findOne(subjectFilter).select("subjectId name").lean()
    : null;
  if (!subject) {
    throw new ExamPaperImportError(
      "Select a subject that already exists in the learning curriculum.",
      { statusCode: 400 },
    );
  }

  return {
    examBody,
    subject: subject.name,
    subjectId: subject.subjectId,
    year,
    paperType,
    durationMinutes,
    status: body.status === "published" ? "published" : "draft",
  };
}

function getSource(req, { requireContent = true } = {}) {
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  const images = Array.isArray(req.files) ? req.files : [];

  if (text.length > MAX_TEXT_LENGTH) {
    throw new ExamPaperImportError("Pasted paper text is too long.", { statusCode: 413 });
  }
  if (images.length > 5) {
    throw new ExamPaperImportError("Upload no more than five images at a time.", {
      statusCode: 413,
    });
  }
  if (images.reduce((sum, image) => sum + image.size, 0) > MAX_TOTAL_IMAGE_BYTES) {
    throw new ExamPaperImportError("The combined image size must not exceed 20 MB.", {
      statusCode: 413,
    });
  }
  if (requireContent && !text && images.length === 0) {
    throw new ExamPaperImportError("Paste paper text or upload at least one image.", {
      statusCode: 400,
    });
  }

  return { text, images };
}

function sendError(res, error, action) {
  console.error(`${action}:`, error);
  const status =
    error.statusCode ||
    (error.name === "ValidationError" || error.name === "CastError"
      ? 400
      : error.code === 11000
        ? 409
        : 500);
  const message =
    error instanceof ExamPaperImportError || status === 400 || status === 409
      ? error.message
      : `Failed to ${action}.`;
  return res.status(status).json({ success: false, message });
}

async function removeUploadedMedia(uploadedMedia) {
  if (!uploadedMedia.length) return;
  await ExamMedia.deleteMany({
    _id: { $in: uploadedMedia.map(({ media }) => media._id) },
  });
  for (const { publicId } of uploadedMedia) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error("Could not remove uncommitted exam image:", error);
    }
  }
}

async function uploadReferencedImages(images, draft, userId) {
  const indexes = [...collectExamImageIndexes(draft)].sort((a, b) => a - b);
  const mediaIds = new Map();
  const uploadedMedia = [];

  try {
    for (const index of indexes) {
      const file = images[index];
      if (!file) {
        throw new ExamPaperImportError(
          `Image ${index + 1} is missing. Generate the preview again with the same images.`,
          { statusCode: 400 },
        );
      }

      const uploaded = await uploadImage(file, "exam-media");
      try {
        const media = await ExamMedia.create({
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          alt: file.originalname || "",
          width: uploaded.width,
          height: uploaded.height,
          mime: file.mimetype,
          uploadedBy: String(userId),
        });
        uploadedMedia.push({ media, publicId: uploaded.public_id });
        mediaIds.set(index, {
          mediaId: media._id,
          src: media.url,
          alt: media.alt,
        });
      } catch (error) {
        await cloudinary.uploader.destroy(uploaded.public_id);
        throw error;
      }
    }
  } catch (error) {
    await removeUploadedMedia(uploadedMedia);
    throw error;
  }

  return { mediaIds, uploadedMedia };
}

export async function listExamImportSubjects(req, res) {
  try {
    const subjects = await Subject.find({})
      .select("subjectId name")
      .sort({ name: 1 })
      .lean();
    return res.json({ success: true, data: subjects });
  } catch (error) {
    return sendError(res, error, "load curriculum subjects");
  }
}

export async function previewExamPaperImport(req, res) {
  try {
    const metadata = await readMetadata(req.body);
    const { text, images } = getSource(req);
    const draft = await generateExamPaperImport({ metadata, text, images });
    return res.json({ success: true, data: draft });
  } catch (error) {
    return sendError(res, error, "generate exam paper preview");
  }
}

export async function saveExamPaperImport(req, res) {
  const uploadedMedia = [];
  try {
    const metadata = await readMetadata(req.body);
    const { images } = getSource(req, { requireContent: false });
    let rawDraft;
    try {
      rawDraft = JSON.parse(req.body.draft);
    } catch {
      throw new ExamPaperImportError("The generated paper draft is not valid JSON.", {
        statusCode: 400,
      });
    }
    if (rawDraft.imageCount !== images.length) {
      throw new ExamPaperImportError(
        "The uploaded images no longer match this preview. Generate the preview again.",
        { statusCode: 400 },
      );
    }

    const draft = validateExamPaperImportResult(rawDraft, metadata, images.length);
    const paperId = req.body.paperId;
    if (paperId && !mongoose.isValidObjectId(paperId)) {
      throw new ExamPaperImportError("Invalid paper ID.", { statusCode: 400 });
    }

    const existingPaper = paperId ? await ExamPaper.findById(paperId) : null;
    if (paperId && !existingPaper) {
      throw new ExamPaperImportError("Exam paper not found.", { statusCode: 404 });
    }

    const { mediaIds, uploadedMedia: createdMedia } = await uploadReferencedImages(
      images,
      draft,
      req.user?._id,
    );
    uploadedMedia.push(...createdMedia);
    const resolvedDraft = resolveExamImageIndexes(draft, mediaIds);
    const paperData = {
      ...metadata,
      title: resolvedDraft.title,
      slug: resolvedDraft.slug,
      durationMinutes: resolvedDraft.metadata.durationMinutes,
      contentHtml: renderExamPaperHtml(resolvedDraft.blocks),
      studentHtml: renderExamPaperHtml(resolvedDraft.blocks, { includeAnswers: false }),
      questionCount: resolvedDraft.blocks.filter((block) => block.type === "question").length,
      blocks: undefined,
    };

    await assertMediaExists(resolvedDraft.blocks);
    if (existingPaper) {
      existingPaper.set(paperData);
      await existingPaper.save();
    }

    const paper = existingPaper
      ? existingPaper
      : await ExamPaper.create(paperData);
    return res.status(existingPaper ? 200 : 201).json({
      success: true,
      data: {
        paper,
        contentHtml: paper.contentHtml,
        questionCount: paper.questionCount,
      },
    });
  } catch (error) {
    try {
      await removeUploadedMedia(uploadedMedia);
    } catch (cleanupError) {
      console.error("Could not clean up exam import media:", cleanupError);
    }
    return sendError(res, error, "save exam paper import");
  }
}
