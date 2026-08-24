import mongoose from "mongoose";

const { Schema } = mongoose;

const WalletSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "Usertp",
      default: null,
      index: true
    },

    ownerType: {
      type: String,
      enum: ["USER", "PLATFORM"],
      required: true,
     
    },

    balance: {
      type: Number,
      default: 0,
      min: 0
    },

    currency: {
      type: String,
      default: "NGN"
    },

    status: {
      type: String,
      enum: [
        "ACTIVE",
        "SUSPENDED",
        "FROZEN",
        "CLOSED"
      ],
      default: "ACTIVE",
      index: true
    },

    lastTransactionAt: {
      type: Date,
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
| INDEXES
|--------------------------------------------------------------------------
*/

WalletSchema.index(
    { ownerType: 1 },
    {
        unique: true,
        partialFilterExpression: {
            ownerType: "PLATFORM"
        }
    }
);

/*
|--------------------------------------------------------------------------
| VIRTUALS
|--------------------------------------------------------------------------
*/

WalletSchema.virtual("availableBalance").get(function () {
  return this.balance;
});

/*
|--------------------------------------------------------------------------
| METHODS
|--------------------------------------------------------------------------
*/

WalletSchema.methods.isActive = function () {
  return this.status === "ACTIVE";
};

WalletSchema.methods.canWithdraw = function (amount) {
  return this.status === "ACTIVE" && this.balance >= amount;
};

WalletSchema.methods.credit = function (amount) {
  this.balance += amount;
  this.lastTransactionAt = new Date();
};

WalletSchema.methods.debit = function (amount) {
  if (this.balance < amount) {
    throw new Error("Insufficient wallet balance.");
  }

  this.balance -= amount;
  this.lastTransactionAt = new Date();
};

export default mongoose.model("Wallet", WalletSchema);