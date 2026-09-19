import mongoose from "mongoose";

const { Schema } = mongoose;

const withdrawalSchema = new Schema(
  {
    wallet: {
      type: Schema.Types.ObjectId,
      ref: "Walletcbt",
      required: true,
      index: true,
    },

    owner: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      required: true,
      index: true,
    },

    ownerType: {
      type: String,
      enum: ["TEACHER", "ADMIN"],
      required: true,
      index: true,
    },

    // Amount is KOBO
    amount: {
      type: Number,
      required: true,
      min: 200000,
    },

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

    requestedAt: {
      type: Date,
      default: Date.now,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    // Ledger created when request is made
    requestLedger: {
      type: Schema.Types.ObjectId,
      ref: "Ledgercbt",
      default: null,
    },

    // Ledger created when approved
    settlementLedger: {
      type: Schema.Types.ObjectId,
      ref: "Ledgercbt",
      default: null,
    },

    // Ledger created when rejected
    reversalLedger: {
      type: Schema.Types.ObjectId,
      ref: "Ledgercbt",
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export default mongoose.models.Withdrawal ||
  mongoose.model("Withdrawal", withdrawalSchema);