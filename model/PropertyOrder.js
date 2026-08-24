import mongoose from "mongoose";

const { Schema } = mongoose;
const ImageSchema = new Schema({
  url: { type: String, required: true },
  public_id: String,
  type: {
    type: String,
    enum: ['buyerPhoto', 'propertyPhoto', 'agreementPhoto', 'ogimage'],
    default: 'image'
  }
}, { timestamps: true });
const PropertyOrderSchema = new Schema(
  {

    orderNumber: {
      type: String,
      required: true,
      unique: true
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Propert",
      required: true,
      index: true
    },

    buyer: {
      type: Schema.Types.ObjectId,
      ref: "Usertp",
      required: true,
      index: true
    },

    seller: {
      type: Schema.Types.ObjectId,
      ref: "Usertp",
      required: true,
      index: true
    },

    // Current agreed price
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },

    // Total amount successfully received
    amountPaid: {
      type: Number,
      default: 0,
      min: 0
    },

    // Amount left to pay
    remainingAmount: {
      type: Number,
      min: 0
    },
    totalPlot: {
      type: Number,
      default: null,
      min: 0
    },

    pricePerPlot: {
      type: Number,
      default: null,
      min: 1
    },

    // Money currently held by platform
    escrowAmount: {
      type: Number,
      default: 0,
      min: 0
    },

    currency: {
      type: String,
      default: "NGN"
    },

    allowInstallment: {
      type: Boolean,
      default: false
    },

    minimumInstallment: {
      type: Number,
      default: 0
    },

    paymentStatus: {
      type: String,
      enum: [
        "UNPAID",
        "PARTIALLY_PAID",
        "FULLY_PAID",
        "OVERPAID",
        "REFUNDED"
      ],
      default: "UNPAID",
      index: true
    },

    escrowStatus: {
      type: String,
      enum: [
        "NOT_FUNDED",
        "HELD",
        "FUNDED",
        "PARTIALLY_FUNDED",
        "PARTIALLY_RELEASED",
        "RELEASED",
        "CANCELLED",
        "RELEASE_PENDING",
        "REFUND_PENDING",
        "REFUNDED"
      ],
      default: "NOT_FUNDED",
      index: true
    },

    reasoncancel:{
      type: String,
      default:null
    },

    orderStatus: {
      type: String,
      enum: [
        "PENDING",
        "ACTIVE",
        "PAID",
        "COMPLETED",
        "CANCELLED",
        "EXPIRED"
      ],
      default: "PENDING",
      index: true
    },

    // All successful payments
    payments: [
      {
        type: Schema.Types.ObjectId,
        ref: "Payment"
      }
    ],

inspectionEvidence: [ImageSchema],

    paidAt: Date,

    releasedAt: Date,

    refundedAt: Date,

    completedAt: Date,

    expiresAt: Date,

    notes: {
      type: String,
      trim: true
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {}
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

PropertyOrderSchema.index({
  buyer: 1,
  createdAt: -1
});

PropertyOrderSchema.index({
  seller: 1,
  createdAt: -1
});





/*
|--------------------------------------------------------------------------
| Virtual
|--------------------------------------------------------------------------
*/

PropertyOrderSchema.virtual("paymentPercentage").get(function () {
  if (!this.totalAmount) return 0;

  return Number(
    ((this.paidAmount / this.totalAmount) * 100).toFixed(2)
  );
});

/*
|--------------------------------------------------------------------------
| Methods
|--------------------------------------------------------------------------
*/

PropertyOrderSchema.methods.isFullyPaid = function () {
  return this.remainingAmount <= 0;
};

PropertyOrderSchema.methods.canReleaseEscrow = function () {
  return (
    this.paymentStatus === "FULLY_PAID" &&
    this.escrowStatus === "HELD"
  );
};

PropertyOrderSchema.methods.canRefund = function () {
  return (
    this.escrowStatus === "HELD" &&
    this.paidAmount > 0
  );
};

export default mongoose.model(
  "PropertyOrder",
  PropertyOrderSchema
);