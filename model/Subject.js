import mongoose from "mongoose"

const subjectSchema = new mongoose.Schema(
  {
    subjectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    icon: {
      type: String,
      default: "",
    },

    orderIndex: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
)

export const Subject =
  mongoose.models.Subject ||
  mongoose.model("Subject", subjectSchema)