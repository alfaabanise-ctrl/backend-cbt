import mongoose from "mongoose";

const softwarePwaDeviceBindingSchema = new mongoose.Schema(
  {
    softwareToken: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SoftwareToken",
      required: true,
      unique: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    credentialId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    credentialPublicKey: {
      type: Buffer,
      required: true,
    },
    counter: {
      type: Number,
      default: 0,
      min: 0,
    },
    verificationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    transports: {
      type: [String],
      default: [],
    },
    credentialDeviceType: {
      type: String,
      enum: ["singleDevice", "multiDevice"],
      required: true,
    },
    credentialBackedUp: {
      type: Boolean,
      default: false,
    },
    activeInstallationCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      index: true,
    },
    platform: {
      type: String,
      enum: ["web"],
      default: "web",
    },
    lastVerifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

const SoftwarePwaDeviceBinding =
  mongoose.models.SoftwarePwaDeviceBinding ||
  mongoose.model(
    "SoftwarePwaDeviceBinding",
    softwarePwaDeviceBindingSchema,
  );

export default SoftwarePwaDeviceBinding;
