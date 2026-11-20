import mongoose from "mongoose";
import { BlockSchema } from "./shared/blocks.js";

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    parentKey: { type: String, default: "", trim: true },
    title: { type: String, default: "", trim: true },
    instruction: { type: [BlockSchema], default: [] },
    answerAny: { type: Number, min: 0, default: 0 },
    durationMinutes: { type: Number, min: 0, default: 0 },
    orderIndex: { type: Number, default: 0 },
  },
  { _id: false }
);

const examPaperSchema = new mongoose.Schema(
  {
    examBody: {
      type: String,
      enum: ["WAEC", "NECO", "NABTEB", "JAMB", "OTHER"],
      required: true,
      index: true,
    },
    subject: { type: String, required: true, trim: true, index: true },
    subjectId: { type: String, trim: true, index: true },
    year: { type: Number, required: true, min: 1900, index: true },
    paperType: {
      type: String,
      enum: ["objective", "theory", "practical", "mixed"],
      default: "objective",
    },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    contentHtml: { type: String, default: "" },
    studentHtml: { type: String, default: "", select: false },
    questionCount: { type: Number, min: 0, default: 0 },
    blocks: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    instruction: { type: [BlockSchema], default: [] },
    durationMinutes: { type: Number, min: 0, default: 0 },
    sections: { type: [sectionSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

examPaperSchema.index(
  { examBody: 1, subject: 1, year: 1, paperType: 1 },
  { unique: true }
);

const ExamPaper =
  mongoose.models.ExamPaper ||
  mongoose.model("ExamPaper", examPaperSchema);

export default ExamPaper;
