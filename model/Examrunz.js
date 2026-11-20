import mongoose from "mongoose"

const ExamrunzSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      index: true,
    },

    topicId: {
      type: String,
      
      required: true,
      index: true,
    },
    lessonId:{
      type: String,
      required: true,
      index: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    summary: {
      type: String,
      default: "",
    },

    orderIndex: {
      type: Number,
      default: 0,
      index: true,
    },

    blocks: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
  },
  {
    timestamps: true,
  }
)

ExamrunzSchema.index({
  topicId: 1,
  orderIndex: 1,
})

ExamrunzSchema.index({
  title: "text",
  summary: "text",
})

export const Examrunz=
  mongoose.models.Examrunz ||
  mongoose.model(
    "Examrunz",
    ExamrunzSchema
  );