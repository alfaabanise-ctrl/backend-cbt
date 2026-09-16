import mongoose from "mongoose";

const { Schema } = mongoose;

const PaymentSchema = new Schema(
  {
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
    },

    TransactionId: {
      type: String,
      default: null,
      trim: true,
    },

    gateway: {
      type: String,
      enum: ["FLUTTERWAVE", "PAYSTACK"],
      default: "PAYSTACK",
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

    // Student/user who made the payment
    payer: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      required: true,
      index: true,
    },

    // Software token connected to this payment
    softwareToken: {
      type: Schema.Types.ObjectId,
      ref: "SoftwareToken",
      default: null,
      index: true,
    },

    // Actual token value
    token: {
      type: String,
      default: null,
      trim: true,
    },

    // Payment purpose
    subscriptionType: {
      type: String,
      enum: [
        "SOFTWARE_TOKEN",
        "SUBSCRIPTION",
        "OTHER",
      ],
      default: "SOFTWARE_TOKEN",
      index: true,
    },

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

    webhookReceived: {
      type: Boolean,
      default: false,
    },

    webhookProcessed: {
      type: Boolean,
      default: false,
    },
    paymentPurpose: {
    type: String,
    enum: [
        "STUDENT_SUBSCRIPTION",
        "TOKEN_PURCHASE",
        "STUDENT_REGISTRATION",
        "EXAM_PAYMENT",
        "OTHER"
    ],
    default: "STUDENT_SUBSCRIPTION",
    index: true,
},
    webhookProcessedAt: {
      type: Date,
      default: null,
    },

    gatewayResponse: {
      type: Schema.Types.Mixed,
      default: {},
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    failureReason: {
      type: String,
      default: null,
    },

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
  softwareToken: 1,
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
  gatewayReference: 1,
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
  mongoose.models.Payment ||
  mongoose.model("Paymentcbt", PaymentSchema);

export default Payment;