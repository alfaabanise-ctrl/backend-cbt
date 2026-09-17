
import mongoose from "mongoose";

const { Schema } = mongoose;

const BankSchema = new Schema(
  {
    bankName: {
      type: String,
      trim: true,
      default: "",
    },

    bankCode: {
      type: String,
      trim: true,
      default: "",
    },

    accountNumber: {
      type: String,
      trim: true,
      default: "",
      select: false,
    },

    accountName: {
      type: String,
      trim: true,
      default: "",
    },

    verified: {
      type: Boolean,
      default: false,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const OthercbtSchema = new Schema(
  {
    // --------------------------------------------------
    // USER LINK
    // One Usercbt = one Othercbt
    // --------------------------------------------------
    user: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      required: true,
      unique: true,
      index: true,
    },

    // --------------------------------------------------
    // STUDENT DETAILS
    // --------------------------------------------------
    student: {
      examTarget: {
        type: String,
        enum: [
          "JAMB (UTME/DE)",
          "WAEC",
          "NECO",
        ],
        default: "JAMB (UTME/DE)",
      },
    },

    // --------------------------------------------------
    // TEACHER DETAILS
    // --------------------------------------------------
    teacher: {
      language: {
        type: String,
        trim: true,
        default: "English (UK)",
      },

      skills: {
        type: [String],
        default: [],
      },
    },

    // --------------------------------------------------
    // ADMIN / SUPERADMIN DETAILS
    // --------------------------------------------------
    admin: {
      level: {
        type: String,
        trim: true,
        default: "Admin",
      },

      department: {
        type: String,
        trim: true,
        default: "Operations",
      },

      systemMaintenanceMode: {
        type: Boolean,
        default: false,
      },
    },

    // --------------------------------------------------
    // BANK DETAILS
    // --------------------------------------------------
    bank: {
      type: BankSchema,
      default: () => ({}),
    },

    // --------------------------------------------------
    // SUBJECTS
    // --------------------------------------------------
    subjects: {
      type: [String],
      default: [],
      validate: {
        validator(value) {
          return value.length <= 4;
        },
        message: "A maximum of 4 subjects can be selected.",
      },
    },

    // --------------------------------------------------
    // NOTIFICATIONS
    // --------------------------------------------------
    notifications: {
      dailyReminder: {
        type: Boolean,
        default: true,
      },

      streakAlert: {
        type: Boolean,
        default: true,
      },

      weeklyReport: {
        type: Boolean,
        default: false,
      },

      promoEmails: {
        type: Boolean,
        default: false,
      },
    },

    // --------------------------------------------------
    // THEME
    // --------------------------------------------------
    theme: {
      type: String,
      enum: ["light", "dark"],
      default: "light",
    },
  },
  {
    timestamps: true,
  }
);

// --------------------------------------------------
// MODEL
// --------------------------------------------------

const Othercbt =
  mongoose.models.Othercbt ||
  mongoose.model("Othercbt", OthercbtSchema);

export default Othercbt;

