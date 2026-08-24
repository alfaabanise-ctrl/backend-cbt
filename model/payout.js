import mongoose from "mongoose";

const payoutSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usertp",
      required: true,
    },

    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },

    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      required: true,
    },

    amount: {
      type: Number,
      required: true, // Kobo
    },

    fee: {
      type: Number,
      default: 0,
    },

    netAmount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "SUCCESS",
        "FAILED",
        "REJECTED"
      ],
      default: "PROCESSING",
    },

    reference: {
      type: String,
      unique: true,
      required: true,
    },

    reason: String,

    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    processedAt: Date,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Payout", payoutSchema);