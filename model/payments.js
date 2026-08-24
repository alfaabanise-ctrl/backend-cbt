import mongoose from "mongoose";

const { Schema } = mongoose;

const PaymentSchema = new Schema(
  {
    txRef: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },



    gatewayReference: {
      type: String,
      default: null
    },
    TransactionId: {
      type: String,
      default: null
    },

    gateway: {
      type: String,
      enum: ["FLUTTERWAVE", "PAYSTACK"],
      default: "PAYSTACK"
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
        "UNKNOWN"
      ],
      default: "CARD"
    },

    payer: {
      type: Schema.Types.ObjectId,
      ref: "Usertp",
      required: true,
      index: true
    },

    receiver: {
      type: Schema.Types.ObjectId,
      ref: "Usertp",
      default: null
    },

    order: {
      type: Schema.Types.ObjectId,
      ref: "PropertyOrder",
      required: true,
      index: true
    },

    property: {
      type: Schema.Types.ObjectId,
      ref: "Propert",
      required: true
    },

    amount: {
      type: Number,
      required: true,
      min: 1
    },

    currency: {
      type: String,
      default: "NGN"
    },

    purpose: {
      type: String,
      enum: [
        "PROPERTY_PURCHASE",
        "PROPERTY_DEPOSIT",
        "PROPERTY_BALANCE",
        "INSPECTION",
        "RENT",
        "WALLET_FUNDING",
        "SUBSCRIPTION",
        "ADVERTISEMENT"
      ],
      required: true
    },

    paidAmount:{
      type: Number,
      default: 0
    },
    gatewayFee:{
      type: Number,
      default: 0
    },

    creditAmount:{
      type: Number,
      default: 0
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
        "PARTIALLY_REFUNDED"
      ],
      default: "CREATED",
      index: true
    },

    verified: {
      type: Boolean,
      default: false
    },

    verificationDate: {
      type: Date,
      default: null
    },





    paidAt: {
      type: Date,
      default: null
    },

    expiresAt: {
      type: Date,
      default: null
    },

    webhookReceived: {
      type: Boolean,
      default: false
    },

    webhookProcessed: {
      type: Boolean,
      default: false
    },

    webhookProcessedAt: {
      type: Date,
      default: null
    },

    gatewayResponse: {
      type: Schema.Types.Mixed,
      default: {}
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },

    failureReason: {
      type: String,
      default: null
    },

    ipAddress: {
      type: String,
      default: null
    },

    device: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

PaymentSchema.index({
  payer: 1,
  createdAt: -1
});


PaymentSchema.index({
  property: 1
});




PaymentSchema.index({
  gatewayTransactionId: 1
});

/*
|--------------------------------------------------------------------------
| Virtuals
|--------------------------------------------------------------------------
*/

PaymentSchema.virtual("isSuccessful").get(function () {
  return this.status === "SUCCESS";
});

PaymentSchema.virtual("isRefunded").get(function () {
  return (
    this.status === "REFUNDED" ||
    this.status === "PARTIALLY_REFUNDED"
  );
});

/*
|--------------------------------------------------------------------------
| Methods
|--------------------------------------------------------------------------
*/

PaymentSchema.methods.canRefund = function () {
  return this.status === "SUCCESS";
};

// PaymentSchema.index(
//     { TransactionId: 1 },
//     {
//         unique: true,
//         sparse: true
//     }
// );

PaymentSchema.methods.isPending = function () {
  return [
    "CREATED",
    "PENDING",
    "PROCESSING"
  ].includes(this.status);
};

export default mongoose.model("Payment", PaymentSchema);