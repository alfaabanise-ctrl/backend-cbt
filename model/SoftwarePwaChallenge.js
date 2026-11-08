import mongoose from "mongoose";

const softwarePwaChallengeSchema = new mongoose.Schema(
  {
    softwareToken: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SoftwareToken",
      required: true,
      index: true,
    },
    challenge: {
      type: String,
      required: true,
      unique: true,
    },
    operation: {
      type: String,
      enum: ["identity", "register", "authenticate"],
      required: true,
    },
    systemId: {
      type: String,
      required: true,
    },
    publicKey: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

softwarePwaChallengeSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

const SoftwarePwaChallenge =
  mongoose.models.SoftwarePwaChallenge ||
  mongoose.model("SoftwarePwaChallenge", softwarePwaChallengeSchema);

export default SoftwarePwaChallenge;
