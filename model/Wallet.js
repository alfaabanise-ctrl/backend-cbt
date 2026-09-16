// backend-cbt/model/Wallet.js

import mongoose from "mongoose";

const { Schema } = mongoose;

const WalletSchema = new Schema(
  {
    // The user who owns this wallet
    owner: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      required: true,
      unique: true,
      index: true,
    },

    // Who owns the wallet
    ownerType: {
      type: String,
     enum: ["TEACHER", "ADMIN", "PLATFORM"],
      required: true,
      index: true,
    },

    // Currency
    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    // Money that can currently be withdrawn
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Money earned but not yet available for withdrawal
    pendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Lifetime earnings
    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Lifetime amount withdrawn
    totalWithdrawn: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Lifetime amount refunded/reversed
    totalRefunded: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Wallet status
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "LOCKED", "CLOSED"],
      default: "ACTIVE",
      index: true,
    },

    // Optional bank information for future withdrawals.
    // Do NOT store card PIN, CVV, password, or payment gateway secrets here.
    bankDetails: {
      bankCode: {
        type: String,
        default: null,
        trim: true,
      },

      bankName: {
        type: String,
        default: null,
        trim: true,
      },

      accountNumber: {
        type: String,
        default: null,
        trim: true,
      },

      accountName: {
        type: String,
        default: null,
        trim: true,
      },

      verified: {
        type: Boolean,
        default: false,
      },
    },

    lastTransactionAt: {
      type: Date,
      default: null,
    },

    lastWithdrawalAt: {
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
| Indexes
|--------------------------------------------------------------------------
*/

WalletSchema.index({ owner: 1 }, { unique: true });
WalletSchema.index({ ownerType: 1, status: 1 });
WalletSchema.index({ createdAt: -1 });


/*
|--------------------------------------------------------------------------
| Virtuals
|--------------------------------------------------------------------------
*/

// Total money currently belonging to the wallet,
// including money that is still pending.
WalletSchema.virtual("totalBalance").get(function () {
  return this.availableBalance + this.pendingBalance;
});


/*
|--------------------------------------------------------------------------
| Helper Methods
|--------------------------------------------------------------------------
*/

WalletSchema.methods.canWithdraw = function (amount) {
  if (this.status !== "ACTIVE") {
    return false;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  return this.availableBalance >= amount;
};


WalletSchema.methods.addPending = function (amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid pending amount");
  }

  this.pendingBalance += amount;
  this.totalEarned += amount;
  this.lastTransactionAt = new Date();

  return this;
};


WalletSchema.methods.releasePending = function (amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid release amount");
  }

  if (this.pendingBalance < amount) {
    throw new Error("Insufficient pending balance");
  }

  this.pendingBalance -= amount;
  this.availableBalance += amount;
  this.lastTransactionAt = new Date();

  return this;
};


WalletSchema.methods.withdraw = function (amount) {
  if (!this.canWithdraw(amount)) {
    throw new Error("Insufficient available balance or wallet is not active");
  }

  this.availableBalance -= amount;
  this.totalWithdrawn += amount;
  this.lastWithdrawalAt = new Date();
  this.lastTransactionAt = new Date();

  return this;
};


WalletSchema.methods.refundPending = function (amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid refund amount");
  }

  if (this.pendingBalance < amount) {
    throw new Error("Insufficient pending balance");
  }

  this.pendingBalance -= amount;
  this.totalRefunded += amount;
  this.lastTransactionAt = new Date();

  return this;
};


WalletSchema.methods.refundAvailable = function (amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid refund amount");
  }

  if (this.availableBalance < amount) {
    throw new Error("Insufficient available balance");
  }

  this.availableBalance -= amount;
  this.totalRefunded += amount;
  this.lastTransactionAt = new Date();

  return this;
};


/*
|--------------------------------------------------------------------------
| JSON / Object
|--------------------------------------------------------------------------
*/

WalletSchema.set("toJSON", {
  virtuals: true,
});

WalletSchema.set("toObject", {
  virtuals: true,
});


/*
|--------------------------------------------------------------------------
| Model
|--------------------------------------------------------------------------
*/

const Wallet =
  mongoose.models.Wallet ||
  mongoose.model("Wallet", WalletSchema);

export default Wallet;