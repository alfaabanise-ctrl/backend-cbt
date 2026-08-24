import mongoose from "mongoose";

const bankAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usertp",
      required: true,
      index: true,
    },

    bankName: {
      type: String,
      required: true,
    },

    bankCode: {
      type: String,
      required: true,
    },

    accountNumber: {
      type: String,
      required: true,
    },

    accountName: {
      type: String,
      required: true,
    },

    verified: {
      type: Boolean,
      default: false,
    },
    rejectionReason: {
      type: String,
      default: null,
    },


    isDefault: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "PENDING","REJECTED",  "DISABLED"],
      default: "PENDING",
    }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("BankAccount", bankAccountSchema);