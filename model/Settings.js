import mongoose from "mongoose"

const settingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      required: true
    },

    selectedSubjects: {
      type: [String],
      default: []
    },

    examSettings: {
      mode: {
        type: String,
        default: "practice"
      },

      duration: {
        type: String,
        default: "02:00:00"
      },

      shuffleQuestions: {
        type: Boolean,
        default: true
      },

      shuffleOptions: {
        type: Boolean,
        default: true
      }
    }
  },
  {
    timestamps: true
  }
)

export default mongoose.model("Settings", settingsSchema)