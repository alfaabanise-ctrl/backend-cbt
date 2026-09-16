import mongoose from "mongoose";

const { Schema } = mongoose;

const PaymentSchema = new Schema(
  {
    // ============================================================
    // TRANSACTION
    // ============================================================

    txRef: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    gatewayReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    transactionId: {
      type: String,
      default: null,
      trim: true,
    },

    // ============================================================
    // PAYMENT GATEWAY
    // ============================================================

    gateway: {
      type: String,
      enum: ["PAYSTACK"],
      default: "PAYSTACK",
      index: true,
    },

    paymentMethod: {
      type: String,
      enum: [
        "CARD",
        "BANK_TRANSFER",
        "USSD",
        "ACCOUNT",
        "QR",
        "MOBILE_MONEY",
        "UNKNOWN",
      ],
      default: "UNKNOWN",
    },

    // ============================================================
    // USER WHO MADE THE PAYMENT
    // ============================================================

    payer: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      required: true,
      index: true,
    },

    // ============================================================
    // CBT PAYMENT INFORMATION
    // ============================================================

    paymentPurpose: {
      type: String,
      enum: [
        "STUDENT_SUBSCRIPTION",
        "TOKEN_PURCHASE",
        "STUDENT_REGISTRATION",
        "EXAM_PAYMENT",
        "PIN_PURCHASE",
        "PROPERTY_PURCHASE",
        "SUBSCRIPTION",
        "GENERAL_PAYMENT",
        "OTHER",
      ],
      default: "TOKEN_PURCHASE",
      index: true,
    },

    subscriptionType: {
      type: String,
      enum: [
        "SOFTWARE_TOKEN",
        "SUBSCRIPTION",
        "OTHER",
      ],
      default: "OTHER",
      index: true,
    },

    // ============================================================
    // SOFTWARE TOKEN
    // ============================================================

    softwareToken: {
      type: Schema.Types.ObjectId,
      ref: "SoftwareToken",
      default: null,
      index: true,
    },

    token: {
      type: String,
      default: null,
      trim: true,
    },

    // ============================================================
    // AMOUNT
    // ============================================================

    // Stored in Kobo
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    gatewayFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    creditAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ============================================================
    // PAYMENT STATUS
    // ============================================================

    status: {
      type: String,
      enum: [
        "CREATED",
        "PENDING",
        "PROCESSING",
        "SUCCESS",
        "FAILED",
        "CANCELLED",
        "EXPIRED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
      ],
      default: "CREATED",
      index: true,
    },

    verified: {
      type: Boolean,
      default: false,
      index: true,
    },

    verificationDate: {
      type: Date,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
      index: true,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    // ============================================================
    // WEBHOOK
    // ============================================================

    webhookReceived: {
      type: Boolean,
      default: false,
    },

    webhookProcessed: {
      type: Boolean,
      default: false,
    },

    webhookProcessedAt: {
      type: Date,
      default: null,
    },

    // ============================================================
    // GATEWAY RESPONSE
    // ============================================================

    gatewayResponse: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // ============================================================
    // EXTRA PAYMENT INFORMATION
    // ============================================================

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    failureReason: {
      type: String,
      default: null,
    },

    // ============================================================
    // REQUEST INFORMATION
    // ============================================================

    ipAddress: {
      type: String,
      default: null,
    },

    device: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ============================================================
// INDEXES
// ============================================================

PaymentSchema.index({
  payer: 1,
  createdAt: -1,
});

PaymentSchema.index({
  status: 1,
  verified: 1,
});

PaymentSchema.index({
  payer: 1,
  status: 1,
  verified: 1,
});

PaymentSchema.index({
  payer: 1,
  paymentPurpose: 1,
  status: 1,
});



// ============================================================
// VIRTUALS
// ============================================================

PaymentSchema.virtual("isSuccessful").get(function () {
  return (
    this.status === "SUCCESS" &&
    this.verified === true
  );
});

PaymentSchema.virtual("isRefunded").get(function () {
  return (
    this.status === "REFUNDED" ||
    this.status === "PARTIALLY_REFUNDED"
  );
});

PaymentSchema.virtual("isPaid").get(function () {
  return (
    this.status === "SUCCESS" &&
    this.verified === true
  );
});

// ============================================================
// METHODS
// ============================================================

PaymentSchema.methods.canRefund = function () {
  return (
    this.status === "SUCCESS" &&
    this.verified === true
  );
};

PaymentSchema.methods.isPending = function () {
  return [
    "CREATED",
    "PENDING",
    "PROCESSING",
  ].includes(this.status);
};

// ============================================================
// MODEL
// ============================================================

const Payment =
  mongoose.models.Paymentcbt ||
  mongoose.model("Paymentcbt", PaymentSchema);

export default Payment;