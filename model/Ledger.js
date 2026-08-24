import mongoose from "mongoose";

const { Schema } = mongoose;

const WalletLedgerSchema = new Schema(
  {
    // Wallet affected
    wallet: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true
    },

    // Payment that caused this ledger entry
    payment: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true
    },

    // Related order
    order: {
      type: Schema.Types.ObjectId,
      ref: "PropertyOrder",
      default: null,
      index: true
    },

    

    // CREDIT or DEBIT
    type: {
      type: String,
      enum: [
        "CREDIT",
        "DEBIT"
      ],
      required: true
    },

    // Business reason
    category: {
      type: String,
      enum: [
        "ESCROW_DEPOSIT",
        "ESCROW_RELEASE",
        "ESCROW_REFUND",

        "PROPERTY_PAYMENT",

        "WALLET_FUNDING",

        "WITHDRAWAL",

        "COMMISSION",

        "REVERSAL",

        "ADJUSTMENT"
      ],
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

    balanceBefore: {
      type: Number,
      required: true
    },

    balanceAfter: {
      type: Number,
      required: true
    },

    reference: {
      type: String,
      required: true,
      index: true
    },



    description: {
      type: String,
      trim: true
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "COMPLETED",
        "FAILED",
        "REVERSED"
      ],
      default: "COMPLETED"
    },

    // Links a reversal/refund to the original ledger
    relatedLedger: {
      type: Schema.Types.ObjectId,
      ref: "WalletLedger",
      default: null
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

WalletLedgerSchema.index({
  wallet: 1,
  createdAt: -1
});

WalletLedgerSchema.index(
    {
        reference: 1,
        category: 1,
        type: 1
    },
    {
        unique: true,
        partialFilterExpression: {
            reference: {
                $type: "string"
            }
        }
    }
);
WalletLedgerSchema.index(
    {
        payment: 1,
        category: 1,
        type: 1
    },
    {
        unique: true,
        partialFilterExpression: {
            payment: {
                $type: "objectId"
            },
            category: "ESCROW_DEPOSIT",
            type: "CREDIT"
        }
    }
);

WalletLedgerSchema.index({
  status: 1
});

/*
|--------------------------------------------------------------------------
| Virtual
|--------------------------------------------------------------------------
*/

WalletLedgerSchema.virtual("signedAmount").get(function () {
  return this.type === "DEBIT"
    ? -this.amount
    : this.amount;
});

/*
|--------------------------------------------------------------------------
| Methods
|--------------------------------------------------------------------------
*/

WalletLedgerSchema.methods.isCredit = function () {
  return this.type === "CREDIT";
};

WalletLedgerSchema.methods.isDebit = function () {
  return this.type === "DEBIT";
};

export default mongoose.model(
  "Ledger",
  WalletLedgerSchema
);