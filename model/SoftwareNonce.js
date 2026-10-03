import mongoose from "mongoose";

const softwareNonceSchema = new mongoose.Schema(
  {
    nonce: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    installation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SoftwareInstallation",
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    
    },
  },
  {
    timestamps: true,
  }
);

/*
 * MongoDB automatically removes expired nonce records.
 */
softwareNonceSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const SoftwareNonce =
  mongoose.models.SoftwareNonce ||
  mongoose.model("SoftwareNonce", softwareNonceSchema);

export default SoftwareNonce;