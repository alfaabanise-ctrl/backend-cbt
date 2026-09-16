import mongoose from "mongoose";

const softwareTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Account that owns this token
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usercbt",
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
    },

    deviceCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "SoftwareToken",
  softwareTokenSchema
);