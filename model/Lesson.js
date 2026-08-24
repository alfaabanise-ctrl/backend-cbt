import mongoose from "mongoose"

const lessonSchema = new mongoose.Schema(
  {
    subjectId: {
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

lessonSchema.index({
  topicId: 1,
  orderIndex: 1,
})

lessonSchema.index({
  title: "text",
  summary: "text",
})

export const Lesson = mongoose.model(
  "Lesson",
  lessonSchema
)