// model/Question.js

import mongoose from "mongoose";

// =========================================================
// COMMON MISTAKE SCHEMA
// =========================================================

const commonMistakeSchema = new mongoose.Schema(
  {
    mistake: {
      type: String,
      default: null,
      trim: true,
    },

    whyWrong: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    _id: false,
  }
);

// =========================================================
// EXPLANATION SCHEMA
// Shared storage format for generated and imported explanations
// =========================================================

const explanationSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      default: null,
      trim: true,
    },

    explanation: {
      type: String,
      default: null,
      trim: true,
    },

    simplifiedExplanation: {
      type: String,
      default: null,
      trim: true,
    },

    commonMistakes: {
      type: [commonMistakeSchema],
      default: [],
    },

    solutionImageUrl: {
      type: String,
      default: null,
      trim: true,
    },

    sourceType: {
      type: String,
      default: null,
      trim: true,
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    needsReview: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const classificationSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      default: null,
      trim: true,
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    needsReview: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

// =========================================================
// QUESTION SCHEMA
// =========================================================

const questionSchema = new mongoose.Schema(
  {
    // ==========================================
    // SOURCE
    // ==========================================

    source: {
      type: String,
      default: "ALOC",
      index: true,
      trim: true,
    },

    sourceId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // ==========================================
    // QUESTION
    // ==========================================

    section: {
      type: String,
      default: null,
      trim: true,
    },

    question: {
      type: String,
      required: true,
      trim: true,
    },

    questionText: {
      type: String,
      default: null,
      trim: true,
    },

    text: {
      type: String,
      default: null,
      trim: true,
    },

    // ==========================================
    // EXAM INFORMATION
    // ==========================================

    subject: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    examType: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    year: {
      type: Number,
      required: true,
      index: true,
    },

    questionNumber: {
      type: Number,
      default: null,
    },

    number: {
      type: Number,
      default: null,
    },

    // ==========================================
    // OPTIONS
    // ==========================================

    options: {
      a: {
        type: String,
        default: null,
      },

      b: {
        type: String,
        default: null,
      },

      c: {
        type: String,
        default: null,
      },

      d: {
        type: String,
        default: null,
      },

      e: {
        type: String,
        default: null,
      },
    },

    // ==========================================
    // ANSWER
    // ==========================================

    answer: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },

    correctAnswer: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },

    // ==========================================
    // EXPLANATION
    // ==========================================

    explanation: {
      type: explanationSchema,
      default: null,
    },

    // ==========================================
    // TOPIC
    // ==========================================

    topic: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: null,
      lowercase: true,
      trim: true,
      index: true,
    },

    classification: {
      type: classificationSchema,
      default: null,
    },

    // ==========================================
    // IMAGE / MEDIA
    // ==========================================

    image: {
      type: String,
      default: null,
    },

    imageUrl: {
      type: String,
      default: null,
    },

    // ==========================================
    // COUNTRY
    // ==========================================

    country: {
      type: String,
      default: "NG",
      trim: true,
    },

    // ==========================================
    // API METADATA
    // ==========================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },

  {
    timestamps: true,
    collection: "questions",
  }
);

// =========================================================
// INDEXES
// =========================================================

questionSchema.index(
  {
    source: 1,
    sourceId: 1,
  },
  {
    unique: true,
  }
);

questionSchema.index({
  examType: 1,
  subject: 1,
  year: 1,
});

questionSchema.index({
  subject: 1,
  topic: 1,
});

questionSchema.index({
  "explanation.needsReview": 1,
});

questionSchema.index({
  "explanation.sourceType": 1,
});

// =========================================================
// EXPORT
// =========================================================

const Question =
  mongoose.models.Question ||
  mongoose.model("Question", questionSchema);

export default Question;