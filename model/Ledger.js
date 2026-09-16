// backend-cbt/model/Ledger.js

import mongoose from "mongoose";

const { Schema } = mongoose;

/*
|--------------------------------------------------------------------------
| Ledger
|--------------------------------------------------------------------------
|
| IMMUTABLE FINANCIAL LEDGER
|
| This collection is the permanent accounting history for wallets.
|
| RULES:
| 1. Never edit a completed ledger entry.
| 2. Never delete a ledger entry.
| 3. Corrections must create a new REVERSAL entry.
| 4. Every financial event must have a unique idempotencyKey.
| 5. Wallet balance is the current balance.
| 6. Ledger is the historical source of truth.
|
*/


const LedgerSchema = new Schema(
  {
    /*
    |--------------------------------------------------------------------------
    | WALLET
    |--------------------------------------------------------------------------
    */

    wallet: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },


    /*
    |--------------------------------------------------------------------------
    | OWNER
    |--------------------------------------------------------------------------
    */

    owner: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      required: true,
      index: true,
    },

ownerType: {
  type: String,
  enum: [
    "TEACHER",
    "ADMIN",
    "PLATFORM",
  ],
  required: true,
  index: true,
},


    /*
    |--------------------------------------------------------------------------
    | LEDGER ENTRY TYPE
    |--------------------------------------------------------------------------
    */

    entryType: {
      type: String,
      enum: [
        "COMMISSION",
        "REFERRAL_BONUS",
        "WITHDRAWAL",
        "PAYOUT",
        "REFUND",
        "REVERSAL",
        "ADJUSTMENT",
      ],
      required: true,
      index: true,
    },


    /*
    |--------------------------------------------------------------------------
    | ENTRY DIRECTION
    |--------------------------------------------------------------------------
    */

    direction: {
      type: String,
      enum: [
        "CREDIT",
        "DEBIT",
      ],
      required: true,
      index: true,
    },


    /*
    |--------------------------------------------------------------------------
    | AMOUNT
    |--------------------------------------------------------------------------
    */

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
      index: true,
    },


    /*
    |--------------------------------------------------------------------------
    | AVAILABLE BALANCE SNAPSHOT
    |--------------------------------------------------------------------------
    |
    | Balance BEFORE and AFTER this ledger entry.
    |
    */

    availableBalanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    availableBalanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },


    /*
    |--------------------------------------------------------------------------
    | PENDING BALANCE SNAPSHOT
    |--------------------------------------------------------------------------
    */

    pendingBalanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    pendingBalanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },


    /*
    |--------------------------------------------------------------------------
    | TOTAL BALANCE SNAPSHOT
    |--------------------------------------------------------------------------
    */

    totalBalanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    totalBalanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },


    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    */

    status: {
      type: String,
      enum: [
        "PENDING",
        "COMPLETED",
        "FAILED",
        "REVERSED",
        "CANCELLED",
      ],
      default: "COMPLETED",
      index: true,
    },


    /*
    |--------------------------------------------------------------------------
    | UNIQUE LEDGER REFERENCE
    |--------------------------------------------------------------------------
    |
    | Example:
    |
    | LED-COM-20260915-A8F32D
    |
    */

    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },


    /*
    |--------------------------------------------------------------------------
    | IDEMPOTENCY KEY
    |--------------------------------------------------------------------------
    |
    | Prevents duplicate credits when the same payment/webhook
    | is processed more than once.
    |
    */

    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },


    /*
    |--------------------------------------------------------------------------
    | PAYMENT
    |--------------------------------------------------------------------------
    */

    payment: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },


    /*
    |--------------------------------------------------------------------------
    | RELATED LEDGER ENTRY
    |--------------------------------------------------------------------------
    |
    | Used for:
    |
    | Original commission
    |        ↓
    | Reversal
    |
    */

    relatedLedger: {
      type: Schema.Types.ObjectId,
      ref: "Ledger",
      default: null,
      index: true,
    },


    /*
    |--------------------------------------------------------------------------
    | EXTERNAL REFERENCE
    |--------------------------------------------------------------------------
    |
    | Paystack / Flutterwave / bank / payout provider reference.
    |
    */

    externalReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },


    /*
    |--------------------------------------------------------------------------
    | DESCRIPTION
    |--------------------------------------------------------------------------
    */

    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },


    /*
    |--------------------------------------------------------------------------
    | METADATA
    |--------------------------------------------------------------------------
    */

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },


    /*
    |--------------------------------------------------------------------------
    | CREATED BY
    |--------------------------------------------------------------------------
    |
    | Useful for manual admin adjustments.
    |
    */

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
    },


    /*
    |--------------------------------------------------------------------------
    | COMPLETED AT
    |--------------------------------------------------------------------------
    */

    completedAt: {
      type: Date,
      default: null,
    },


    /*
    |--------------------------------------------------------------------------
    | REVERSED AT
    |--------------------------------------------------------------------------
    */

    reversedAt: {
      type: Date,
      default: null,
    },
  },

  {
    timestamps: true,
    versionKey: false,
  }
);


/*
|--------------------------------------------------------------------------
| INDEXES
|--------------------------------------------------------------------------
*/

LedgerSchema.index({
  wallet: 1,
  createdAt: -1,
});



LedgerSchema.index({
  owner: 1,
  entryType: 1,
  createdAt: -1,
});

LedgerSchema.index({
  payment: 1,
  entryType: 1,
});

LedgerSchema.index({
  wallet: 1,
  status: 1,
  createdAt: -1,
});

LedgerSchema.index({
  ownerType: 1,
  entryType: 1,
  createdAt: -1,
});


/*
|--------------------------------------------------------------------------
| VALIDATION
|--------------------------------------------------------------------------
*/

LedgerSchema.pre("validate", function (next) {
  if (!Number.isFinite(this.amount) || this.amount <= 0) {
    return next(
      new Error("Ledger amount must be greater than zero")
    );
  }

  if (
    !Number.isFinite(this.availableBalanceBefore) ||
    this.availableBalanceBefore < 0
  ) {
    return next(
      new Error("Invalid availableBalanceBefore")
    );
  }

  if (
    !Number.isFinite(this.availableBalanceAfter) ||
    this.availableBalanceAfter < 0
  ) {
    return next(
      new Error("Invalid availableBalanceAfter")
    );
  }

  if (
    !Number.isFinite(this.pendingBalanceBefore) ||
    this.pendingBalanceBefore < 0
  ) {
    return next(
      new Error("Invalid pendingBalanceBefore")
    );
  }

  if (
    !Number.isFinite(this.pendingBalanceAfter) ||
    this.pendingBalanceAfter < 0
  ) {
    return next(
      new Error("Invalid pendingBalanceAfter")
    );
  }

  if (
    !Number.isFinite(this.totalBalanceBefore) ||
    this.totalBalanceBefore < 0
  ) {
    return next(
      new Error("Invalid totalBalanceBefore")
    );
  }

  if (
    !Number.isFinite(this.totalBalanceAfter) ||
    this.totalBalanceAfter < 0
  ) {
    return next(
      new Error("Invalid totalBalanceAfter")
    );
  }

  next();
});


/*
|--------------------------------------------------------------------------
| LEDGER IMMUTABILITY
|--------------------------------------------------------------------------
|
| Financial fields cannot be changed after creation.
|
| If something is wrong:
|
| OLD ENTRY
|     ↓
| REVERSAL ENTRY
|
| Never edit the original financial record.
|
*/

const immutableFields = [
  "wallet",
  "owner",
  "ownerType",
  "entryType",
  "direction",
  "amount",
  "currency",

  "availableBalanceBefore",
  "availableBalanceAfter",

  "pendingBalanceBefore",
  "pendingBalanceAfter",

  "totalBalanceBefore",
  "totalBalanceAfter",

  "reference",
  "idempotencyKey",

  "payment",
  "relatedLedger",
];


function checkImmutableUpdate(next) {
  const update = this.getUpdate() || {};

  const fieldsBeingChanged = new Set();

  for (const key of Object.keys(update)) {
    if (key === "$set" && update.$set) {
      Object.keys(update.$set).forEach((field) => {
        fieldsBeingChanged.add(field);
      });
    } else if (key === "$unset" && update.$unset) {
      Object.keys(update.$unset).forEach((field) => {
        fieldsBeingChanged.add(field);
      });
    } else if (key === "$inc" && update.$inc) {
      Object.keys(update.$inc).forEach((field) => {
        fieldsBeingChanged.add(field);
      });
    } else if (!key.startsWith("$")) {
      fieldsBeingChanged.add(key);
    }
  }

  for (const field of fieldsBeingChanged) {
    if (immutableFields.includes(field)) {
      return next(
        new Error(
          `Ledger field "${field}" is immutable. Create a reversal ledger entry instead.`
        )
      );
    }
  }

  next();
}


LedgerSchema.pre(
  "findOneAndUpdate",
  checkImmutableUpdate
);

LedgerSchema.pre(
  "updateOne",
  checkImmutableUpdate
);

LedgerSchema.pre(
  "updateMany",
  checkImmutableUpdate
);


/*
|--------------------------------------------------------------------------
| BLOCK DELETE
|--------------------------------------------------------------------------
|
| Ledger records should never be deleted.
|
*/

function preventDelete(next) {
  return next(
    new Error(
      "Ledger entries cannot be deleted. Create a reversal entry instead."
    )
  );
}

LedgerSchema.pre(
  "deleteOne",
  preventDelete
);

LedgerSchema.pre(
  "deleteMany",
  preventDelete
);

LedgerSchema.pre(
  "findOneAndDelete",
  preventDelete
);

LedgerSchema.pre(
  "findOneAndRemove",
  preventDelete
);


/*
|--------------------------------------------------------------------------
| HELPER METHODS
|--------------------------------------------------------------------------
*/

LedgerSchema.methods.isCredit = function () {
  return this.direction === "CREDIT";
};


LedgerSchema.methods.isDebit = function () {
  return this.direction === "DEBIT";
};


LedgerSchema.methods.isCompleted = function () {
  return this.status === "COMPLETED";
};


LedgerSchema.methods.isReversed = function () {
  return this.status === "REVERSED";
};


LedgerSchema.methods.isPending = function () {
  return this.status === "PENDING";
};


/*
|--------------------------------------------------------------------------
| MODEL
|--------------------------------------------------------------------------
*/

const Ledger =
  mongoose.models.Ledgercbt ||
  mongoose.model("Ledgercbt", LedgerSchema);

export default Ledger;