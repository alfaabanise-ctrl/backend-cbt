import mongoose from "mongoose"

const topicSchema = new mongoose.Schema(
  {
    subjectId: {
         type: String,
      required: true,
      index: true,
    },
    topicId:{
        type: String,
        required: true,
        index:true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    orderIndex: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

export const Topic = mongoose.model(
  "Topic",
  topicSchema
)