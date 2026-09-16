import mongoose from "mongoose";
import Wallet from "../model/Wallet.js";
import Ledger from "../model/Ledger.js";
import Usertp from "../model/Users.js";

/*
|--------------------------------------------------------------------------
| WALLET SERVICE
|--------------------------------------------------------------------------
|
| Wallet = current balance
| Ledger = immutable accounting history
|
| IMPORTANT:
| All monetary amounts passed to this service are in KOBO.
|
|--------------------------------------------------------------------------
*/

class WalletService {
  /*
  |--------------------------------------------------------------------------
  | Helpers
  |--------------------------------------------------------------------------
  */

  static assertValidAmount(amount) {
    const value = Number(amount);

    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid wallet amount: ${amount}`);
    }

    return value;
  }

  static normalizeSession(session) {
    return session || null;
  }

  static async getOrCreateUserWallet({
    userId,
    session = null,
  }) {
    if (!userId) {
      throw new Error("userId is required");
    }

    const UserModel = Usertp;

    let wallet = await Wallet.findOne({
      owner: userId,
      ownerType: "USER",
      status: "ACTIVE",
    }).session(session);

    if (wallet) {
      return wallet;
    }

    const user = await UserModel.findById(userId)
      .select("_id")
      .session(session);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    try {
      const created = await Wallet.create(
        [
          {
            owner: user._id,
            ownerType: "USER",
            balance: 0,
            pendingBalance: 0,
            currency: "NGN",
            status: "ACTIVE",
          },
        ],
        session ? { session } : undefined
      );

      return created[0];
    } catch (error) {
      /*
       * Another request may have created the wallet
       * simultaneously.
       */
      if (error?.code === 11000) {
        wallet = await Wallet.findOne({
          owner: userId,
          ownerType: "USER",
          status: "ACTIVE",
        }).session(session);

        if (wallet) {
          return wallet;
        }
      }

      throw error;
    }
  }

  static async getPlatformWallet({ session = null }) {
    const wallet = await Wallet.findOne({
      ownerType: "PLATFORM",
      status: "ACTIVE",
    }).session(session);

    if (!wallet) {
      throw new Error("Active platform wallet was not found");
    }

    return wallet;
  }

  /*
  |--------------------------------------------------------------------------
  | Generic credit
  |--------------------------------------------------------------------------
  */

  static async creditWallet({
    wallet,
    owner,
    ownerType,
    amount,
    payment,
    order = null,
    entryType = "PAYMENT",
    reference,
    idempotencyKey,
    description,
    metadata = {},
    createdBy = null,
    session = null,
  }) {
    amount = this.assertValidAmount(amount);

    if (!reference) {
      throw new Error("Ledger reference is required");
    }

    if (!idempotencyKey) {
      throw new Error("Ledger idempotencyKey is required");
    }

    /*
     * Idempotency protection.
     */
    const existingLedger = await Ledger.findOne({
      idempotencyKey,
    }).session(session);

    if (existingLedger) {
      return {
        wallet,
        ledger: existingLedger,
        duplicate: true,
      };
    }

    /*
     * IMPORTANT:
     * Read wallet with transaction/session so concurrent
     * financial operations remain consistent.
     */
    const lockedWallet = await Wallet.findById(wallet._id).session(session);

    if (!lockedWallet) {
      throw new Error(`Wallet not found: ${wallet._id}`);
    }

    const balanceBefore = Number(lockedWallet.balance || 0);
    const pendingBefore = Number(
      lockedWallet.pendingBalance || 0
    );

    const balanceAfter = balanceBefore + amount;

    lockedWallet.balance = balanceAfter;

    await lockedWallet.save({
      session,
    });

    const ledger = new Ledger({
      wallet: lockedWallet._id,

      owner: owner || lockedWallet.owner,
      ownerType: ownerType || lockedWallet.ownerType,

      entryType,
      direction: "CREDIT",

      amount,
      currency: payment?.currency || lockedWallet.currency || "NGN",

      availableBalanceBefore: balanceBefore,
      availableBalanceAfter: balanceAfter,

      pendingBalanceBefore: pendingBefore,
      pendingBalanceAfter: pendingBefore,

      totalBalanceBefore:
        balanceBefore + pendingBefore,

      totalBalanceAfter:
        balanceAfter + pendingBefore,

      status: "COMPLETED",

      reference,
      idempotencyKey,

      payment: payment?._id || null,

      relatedLedger: null,

      externalReference:
        payment?.gatewayReference ||
        payment?.TransactionId ||
        payment?.txRef ||
        null,

      description,

      metadata,

      createdBy,

      completedAt: new Date(),
    });

    await ledger.save({
      session,
    });

    return {
      wallet: lockedWallet,
      ledger,
      duplicate: false,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Generic debit
  |--------------------------------------------------------------------------
  */

  static async debitWallet({
    wallet,
    owner,
    ownerType,
    amount,
    payment = null,
    order = null,
    entryType = "PAYOUT",
    reference,
    idempotencyKey,
    description,
    metadata = {},
    createdBy = null,
    session = null,
  }) {
    amount = this.assertValidAmount(amount);

    if (!reference) {
      throw new Error("Ledger reference is required");
    }

    if (!idempotencyKey) {
      throw new Error("Ledger idempotencyKey is required");
    }

    const existingLedger = await Ledger.findOne({
      idempotencyKey,
    }).session(session);

    if (existingLedger) {
      return {
        wallet,
        ledger: existingLedger,
        duplicate: true,
      };
    }

    const lockedWallet = await Wallet.findById(wallet._id).session(session);

    if (!lockedWallet) {
      throw new Error(`Wallet not found: ${wallet._id}`);
    }

    const balanceBefore = Number(lockedWallet.balance || 0);
    const pendingBefore = Number(
      lockedWallet.pendingBalance || 0
    );

    if (balanceBefore < amount) {
      throw new Error(
        `Insufficient wallet balance. Available: ${balanceBefore}, requested: ${amount}`
      );
    }

    const balanceAfter = balanceBefore - amount;

    lockedWallet.balance = balanceAfter;

    await lockedWallet.save({
      session,
    });

    const ledger = new Ledger({
      wallet: lockedWallet._id,

      owner: owner || lockedWallet.owner,
      ownerType: ownerType || lockedWallet.ownerType,

      entryType,
      direction: "DEBIT",

      amount,
      currency:
        payment?.currency ||
        lockedWallet.currency ||
        "NGN",

      availableBalanceBefore: balanceBefore,
      availableBalanceAfter: balanceAfter,

      pendingBalanceBefore: pendingBefore,
      pendingBalanceAfter: pendingBefore,

      totalBalanceBefore:
        balanceBefore + pendingBefore,

      totalBalanceAfter:
        balanceAfter + pendingBefore,

      status: "COMPLETED",

      reference,
      idempotencyKey,

      payment: payment?._id || null,

      relatedLedger: null,

      externalReference:
        payment?.gatewayReference ||
        payment?.TransactionId ||
        payment?.txRef ||
        null,

      description,

      metadata,

      createdBy,

      completedAt: new Date(),
    });

    await ledger.save({
      session,
    });

    return {
      wallet: lockedWallet,
      ledger,
      duplicate: false,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Credit Teacher
  |--------------------------------------------------------------------------
  */

  static async creditTeacherWallet({
    teacherId,
    payment,
    amount,
    order = null,
    session = null,
    metadata = {},
  }) {
    amount = this.assertValidAmount(amount);

    if (!teacherId) {
      throw new Error("Teacher ID is required");
    }

    const wallet = await this.getOrCreateUserWallet({
      userId: teacherId,
      session,
    });

    return this.creditWallet({
      wallet,

      owner: teacherId,
      ownerType: "USER",

      amount,

      payment,
      order,

      entryType: "COMMISSION",

      reference:
        `${payment.txRef}:TEACHER_COMMISSION`,

      idempotencyKey:
        `${payment._id}:TEACHER_COMMISSION`,

      description:
        `Teacher commission from student payment ${payment.txRef}`,

      metadata: {
        ...metadata,
        role: "TEACHER",
        commissionType: "STUDENT_PAYMENT",
      },

      session,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Credit Admin
  |--------------------------------------------------------------------------
  */

  static async creditAdminWallet({
    adminId,
    payment,
    amount,
    order = null,
    session = null,
    metadata = {},
  }) {
    amount = this.assertValidAmount(amount);

    if (!adminId) {
      throw new Error("Admin ID is required");
    }

    const wallet = await this.getOrCreateUserWallet({
      userId: adminId,
      session,
    });

    return this.creditWallet({
      wallet,

      owner: adminId,
      ownerType: "USER",

      amount,

      payment,
      order,

      entryType: "COMMISSION",

      reference:
        `${payment.txRef}:ADMIN_COMMISSION`,

      idempotencyKey:
        `${payment._id}:ADMIN_COMMISSION`,

      description:
        `Admin commission from student payment ${payment.txRef}`,

      metadata: {
        ...metadata,
        role: "ADMIN",
        commissionType: "STUDENT_PAYMENT",
      },

      session,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Credit Platform
  |--------------------------------------------------------------------------
  */

  static async creditPlatformWallet({
    payment,
    order = null,
    amount,
    transaction = null,
    session = null,
    metadata = {},
  }) {
    amount = this.assertValidAmount(amount);

    const wallet = await this.getPlatformWallet({
      session,
    });

    return this.creditWallet({
      wallet,

      owner: wallet.owner,
      ownerType: "PLATFORM",

      amount,

      payment,
      order,

      entryType: "PAYMENT",

      reference:
        `${payment.txRef}:PLATFORM_SHARE`,

      idempotencyKey:
        `${payment._id}:PLATFORM_SHARE`,

      description:
        `Platform share from student payment ${payment.txRef}`,

      metadata: {
        ...metadata,

        role: "PLATFORM",

        transactionId:
          transaction?.id ||
          transaction?.reference ||
          null,

        paidAmount:
          transaction?.amount || null,

        gatewayFee:
          transaction?.fees || 0,
      },

      session,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Generic User Credit
  |--------------------------------------------------------------------------
  */

  static async creditUserWallet({
    userId,
    payment = null,
    order = null,
    amount,
    category = "PAYMENT",
    entryType = "PAYMENT",
    reference,
    idempotencyKey,
    description,
    metadata = {},
    session = null,
  }) {
    const wallet = await this.getOrCreateUserWallet({
      userId,
      session,
    });

    return this.creditWallet({
      wallet,

      owner: userId,
      ownerType: "USER",

      amount,

      payment,
      order,

      entryType,

      reference:
        reference ||
        `${payment?._id}:USER_CREDIT:${category}`,

      idempotencyKey:
        idempotencyKey ||
        `${payment?._id}:USER_CREDIT:${category}`,

      description:
        description ||
        `User wallet credit`,

      metadata: {
        ...metadata,
        category,
      },

      session,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | User Debit
  |--------------------------------------------------------------------------
  */

  static async debitUserWallet({
    userId,
    payment = null,
    order = null,
    amount,
    category = "PAYOUT",
    entryType = "PAYOUT",
    reference,
    idempotencyKey,
    description,
    metadata = {},
    session = null,
  }) {
    const wallet = await this.getOrCreateUserWallet({
      userId,
      session,
    });

    return this.debitWallet({
      wallet,

      owner: userId,
      ownerType: "USER",

      amount,

      payment,
      order,

      entryType,

      reference:
        reference ||
        `${payment?._id}:USER_DEBIT:${category}`,

      idempotencyKey:
        idempotencyKey ||
        `${payment?._id}:USER_DEBIT:${category}`,

      description:
        description ||
        `User wallet debit`,

      metadata: {
        ...metadata,
        category,
      },

      session,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Dashboard
  |--------------------------------------------------------------------------
  */

  static async getWalletDashboard(userId) {
    const wallet = await Wallet.findOne({
      owner: userId,
      ownerType: "USER",
      status: "ACTIVE",
    }).lean();

    if (!wallet) {
      return {
        wallet: null,

        summary: {
          credits: 0,
          debits: 0,
          commission: 0,
        },

        transactions: [],
      };
    }

    const walletId = new mongoose.Types.ObjectId(
      wallet._id
    );

    const summary = await Ledger.aggregate([
      {
        $match: {
          wallet: walletId,
          status: "COMPLETED",
        },
      },

      {
        $group: {
          _id: null,

          credits: {
            $sum: {
              $cond: [
                {
                  $eq: ["$direction", "CREDIT"],
                },
                "$amount",
                0,
              ],
            },
          },

          debits: {
            $sum: {
              $cond: [
                {
                  $eq: ["$direction", "DEBIT"],
                },
                "$amount",
                0,
              ],
            },
          },

          commission: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$entryType",
                        "COMMISSION",
                      ],
                    },
                    {
                      $eq: [
                        "$direction",
                        "CREDIT",
                      ],
                    },
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
        },
      },
    ]);

    const transactions = await Ledger.find({
      wallet: wallet._id,
    })
      .sort({
        createdAt: -1,
      })
      .limit(20)
      .populate(
        "payment",
        "txRef amount currency status"
      )
      .lean();

    return {
      wallet,

      summary: summary[0] || {
        credits: 0,
        debits: 0,
        commission: 0,
      },

      transactions,
    };
  }
}

export default WalletService;