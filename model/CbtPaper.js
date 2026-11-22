import mongoose from "mongoose"

const cbtPaperSchema = new mongoose.Schema(
  {
    paperId: {
      type: String,
     
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    accesscode: {
  type: String,
  required: true,
  unique: true,
  sparse: true,      // lets old papers without a code exist until they're re-saved
  uppercase: true,
  trim: true,
  select: false,     // never returned unless you ask with .select("+accesscode")
},
    code: {
      type: String,
      default: "",
      trim: true,
    },
    board: {
      type: String,
      enum: ["WAEC", "NECO", "NABTEB", "JAMB", "Custom"],
      default: "Custom",
      index: true,
    },
    year: {
      type: String,
      default: "",
      index: true,
    },
    paper: {
      type: String,
      default: "Past Question",
      trim: true,
    },
    durationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    instructions: {
      type: String,
      default: "",
    },
    examType: {
      type: String,
      enum: ["objective", "practical", "mixed"],
      default: "mixed",
    },
    sections: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    status: {
      type: String,
      enum: ["published", "draft"],
      default: "published",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "cbt_papers",
  }
)

cbtPaperSchema.index({ status: 1, board: 1, year: -1, name: 1 })

const CbtPaper =
  mongoose.models.CbtPaper ||
  mongoose.model("CbtPaper", cbtPaperSchema)

export default CbtPaper
