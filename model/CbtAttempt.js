import mongoose from "mongoose"

const cbtAttemptSchema = new mongoose.Schema(
  {
    paperId: {
      type: String,
      required: true,
      index: true,
    },
    paperName: {
      type: String,
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usercbt",
      required: true,
      index: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    possible: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    answers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "cbt_attempts",
  }
)

const CbtAttempt =
  mongoose.models.CbtAttempt ||
  mongoose.model("CbtAttempt", cbtAttemptSchema)

export default CbtAttempt
