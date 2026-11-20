import mongoose from "mongoose";
import { BlockSchema, nodeFields, PartSchema } from "./shared/blocks.js";

const examQuestionSchema = new mongoose.Schema(
  {
    ...nodeFields,
    paperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamPaper",
      required: true,
      index: true,
    },
    sectionKey: { type: String, default: "", index: true },
    number: { type: Number, required: true, min: 1 },
    label: { type: String, default: "" },
    answerOnly: { type: Boolean, default: false, index: true },
    kind: {
      type: String,
      enum: ["objective", "structured"],
      default: "structured",
    },
    instruction: { type: [BlockSchema], default: [] },
    parts: { type: [PartSchema], default: undefined },
    topic: { type: String, default: "", index: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    orderIndex: { type: Number, default: 0 },
  },
  { timestamps: true }
);

examQuestionSchema.index(
  { paperId: 1, sectionKey: 1, number: 1 },
  { unique: true }
);

const ExamQuestion =
  mongoose.models.ExamQuestion ||
  mongoose.model("ExamQuestion", examQuestionSchema);

export default ExamQuestion;
