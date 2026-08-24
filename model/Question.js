import mongoose from "mongoose";

const optionSchema = new mongoose.Schema(
  {
    a: String,
    b: String,
    c: String,
    d: String,
    e: String
  },
  {
    _id: false
  }
);

const questionSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      default: "ALOC",
      required: true,
      index: true
    },

    // UUID from ALOC API
    sourceId: {
      type: String,
      required: true,
      index: true
    },

    subject: {
      type: String,
      required: true,
      lowercase: true,
      index: true
    },

    examType: {
      type: String,
      required: true,
      lowercase: true,
      index: true
    },

    year: {
      type: Number,
      required: true,
      index: true
    },

    question: {
      type: String,
      required: true
    },

    options: {
      type: optionSchema,
      required: true
    },

    answer: {
      type: String,
      lowercase: true,
      default: null
    },

    country: {
      type: String,
      default: "NG"
    },

    category: {
      type: String,
      default: ""
    },

    questionNumber: {
      type: Number,
      default: null
    },

    hasPassage: {
      type: Boolean,
      default: false
    },

    section: {
      type: String,
      default: ""
    },

    solution: {
      type: String,
      default: ""
    },

    image: {
      type: String,
      default: ""
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    rawData: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Prevent duplicates
questionSchema.index(
  {
    source: 1,
    sourceId: 1
  },
  {
    unique: true
  }
);

export default mongoose.models.Question ||
  mongoose.model("Question", questionSchema);