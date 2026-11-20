import mongoose from "mongoose";

export const BlockSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "latex", "image", "table", "svg"],
      required: true,
    },
    text: { type: String, default: "" },
    mediaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamMedia",
    },
    caption: { type: String, default: "" },
    rows: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

BlockSchema.pre("validate", function validateImageMedia(next) {
  if (this.type === "image" && !this.mediaId) {
    this.invalidate("mediaId", "Image blocks require a mediaId.");
  }
  next();
});

export const OptionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    blocks: { type: [BlockSchema], default: [] },
  },
  { _id: false }
);

const AnswerItemSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    blocks: { type: [BlockSchema], default: [] },
    accept: { type: [String], default: [] },
  },
  { _id: false }
);

export const AnswerSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["none", "single", "list", "labelled", "option"],
      default: "none",
    },
    pick: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator(value) {
          return value === 0 || value <= (this.items?.length || 0);
        },
        message: "pick cannot exceed the number of answer items.",
      },
    },
    correctOption: { type: String, default: "" },
    items: { type: [AnswerItemSchema], default: [] },
  },
  { _id: false }
);

export const nodeFields = {
  id: { type: String, required: true },
  label: { type: String, default: "" },
  prompt: { type: [BlockSchema], default: [] },
  marks: { type: Number, min: 0, default: 0 },
  options: { type: [OptionSchema], default: undefined },
  answer: { type: AnswerSchema, default: () => ({}) },
  explanation: { type: [BlockSchema], default: [] },
};

export const PartSchema = new mongoose.Schema(nodeFields, { _id: false });
PartSchema.add({ parts: { type: [PartSchema], default: undefined } });
