import mongoose from "mongoose";

const withdrawalSchema = new mongoose.Schema(
  {
    // Wallet that owns this withdrawal
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },

    // User requesting the withdrawal
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usercbt",
      required: true,
      index: true,
    },

    // Amount requested in NGN
    amount: {
      type: Number,
      required: true,
      min: 5000,
    },

    // Bank details
    bankName: {
      type: String,
      required: true,
      trim: true,
    },

    accountName: {
      type: String,
      required: true,
      trim: true,
    },

    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },

    // Withdrawal status
    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Completed",
        "Rejected",
      ],
      default: "Pending",
      index: true,
    },

    // When withdrawal was requested
    requestedAt: {
      type: Date,
      default: Date.now,
    },

    // When withdrawal was processed
    processedAt: {
      type: Date,
      default: null,
    },

    // Unique withdrawal reference
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // Reason if rejected
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    // Optional payment/bank information
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

/*
|--------------------------------------------------------------------------
| Prevent OverwriteModelError
|--------------------------------------------------------------------------
*/

const Withdrawal =
  mongoose.models.Withdrawal ||
  mongoose.model("Withdrawal", withdrawalSchema);

export default Withdrawal;