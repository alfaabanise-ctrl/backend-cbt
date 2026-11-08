import mongoose from "mongoose";

const softwareTokenSchema = new mongoose.Schema(
  {
    // Unique token/code purchased by the student
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // Student/account that owns the token
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
      index: true,
    },

    // Subscription plan purchased
    plan: {
      type: String,
      enum: ["Monthly", "Quarterly", "Yearly"],
      default:"Yearly",
      required: true,
      index: true,
    },

    // Amount paid, stored in KOBO
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Paystack/payment reference
    paymentReference: {
      type: String,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "unused",
        "active",
        "used",
        "expired",
        "revoked",
      ],
      default: "unused",
      index: true,
    },

    // User who activated the token
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
    },

    activatedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    features: {
      type: [String],
      default: [],
    },

    deviceLimit: {
      type: Number,
      default: 1,
      min: 1,
    },

    deviceCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    deviceBindings: {
      type: [
        new mongoose.Schema(
          {
            deviceHash: { type: String, default: null },
            fingerprintHash: { type: String, default: null },
            deviceLabel: { type: String, default: "Unknown device" },
            installation: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "SoftwareInstallation",
              default: null,
            },
            boundAt: { type: Date, default: Date.now },
            lastSeenAt: { type: Date, default: Date.now },
          },
          { _id: true },
        ),
      ],
      default: [],
    },

    deviceBindingFailedAttempts: {
      type: Number,
      min: 0,
      default: 0,
    },

    deviceBindingLockedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const SoftwareToken =
  mongoose.models.SoftwareToken ||
  mongoose.model("SoftwareToken", softwareTokenSchema);

export default SoftwareToken;