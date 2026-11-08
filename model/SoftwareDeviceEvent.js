import mongoose from "mongoose";

const softwareDeviceEventSchema = new mongoose.Schema(
  {
    softwareToken: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SoftwareToken",
      required: true,
      index: true,
    },
    installation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SoftwareInstallation",
      default: null,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
    },
    actorRole: {
      type: String,
      enum: ["admin", "superadmin", "teacher", "system"],
      default: "system",
    },
    action: {
      type: String,
      enum: ["bound", "mismatch", "lockout", "reset"],
      required: true,
    },
    deviceHash: {
      type: String,
      default: null,
    },
    reason: {
      type: String,
      maxlength: 250,
      default: null,
    },
  },
  { timestamps: true },
);

const SoftwareDeviceEvent =
  mongoose.models.SoftwareDeviceEvent ||
  mongoose.model("SoftwareDeviceEvent", softwareDeviceEventSchema);

export default SoftwareDeviceEvent;
