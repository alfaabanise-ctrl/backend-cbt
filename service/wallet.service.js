import mongoose from "mongoose";
import Wallet from "../model/Wallet.js";
import Ledger from "../model/Ledger.js";
import Usertp from "../model/Users.js";
import Withdrawal from "../model/Withdrawal.js";
/*
|--------------------------------------------------------------------------
| WALLET SERVICE
|--------------------------------------------------------------------------
|
| Wallet = current wallet balance
| Ledger = immutable accounting history
|
| IMPORTANT:
| All monetary amounts passed to this service are in KOBO.
|
| Wallet.js fields:
|
| availableBalance
| pendingBalance
| totalEarned
| totalWithdrawn
| totalRefunded
|
| Wallet owner types:
|
| TEACHER
| ADMIN
| PLATFORM
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
      throw new Error(
        `Invalid wallet amount: ${amount}`
      );
    }

    return value;
  }

  static normalizeSession(session) {
    return session || null;
  }

  /*
  |--------------------------------------------------------------------------
  | Get Or Create Teacher/Admin Wallet
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  | Wallet.js does NOT support ownerType = "USER".
  |
  | Valid user wallet types are:
  |
  | TEACHER
  | ADMIN
  |
  |--------------------------------------------------------------------------
  */

  static async getOrCreateUserWallet({
    userId,
    ownerType,
    session = null,
  }) {
    if (!userId) {
      throw new Error("userId is required");
    }

    /*
     * Only teacher and admin wallets can be
     * created through this method.
     */
    if (
      !["TEACHER", "ADMIN"].includes(
        ownerType
      )
    ) {
      throw new Error(
        `Invalid user wallet ownerType: ${ownerType}`
      );
    }

    const UserModel = Usertp;

    /*
    |--------------------------------------------------------------------------
    | FIND EXISTING WALLET
    |--------------------------------------------------------------------------
    */

    let wallet = await Wallet.findOne({
      owner: userId,
      ownerType,
      status: "ACTIVE",
    }).session(session);

    if (wallet) {
      return wallet;
    }

    /*
    |--------------------------------------------------------------------------
    | VERIFY USER EXISTS
    |--------------------------------------------------------------------------
    */

    const user =
      await UserModel.findById(userId)
        .select("_id role")
        .session(session);

    if (!user) {
      throw new Error(
        `User not found: ${userId}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | CREATE WALLET
    |--------------------------------------------------------------------------
    */

    try {
      const created =
        await Wallet.create(
          [
            {
              owner: user._id,

              ownerType,

              currency: "NGN",

              availableBalance: 0,

              pendingBalance: 0,

              totalEarned: 0,

              totalWithdrawn: 0,

              totalRefunded: 0,

              status: "ACTIVE",

              bankDetails: {
                bankCode: null,
                bankName: null,
                accountNumber: null,
                accountName: null,
                verified: false,
              },

              lastTransactionAt: null,

              lastWithdrawalAt: null,
            },
          ],
          session
            ? { session }
            : undefined
        );

      return created[0];

    } catch (error) {
      /*
       * Another request may have created
       * the wallet simultaneously.
       */

      if (error?.code === 11000) {
        wallet =
          await Wallet.findOne({
            owner: userId,
            ownerType,
            status: "ACTIVE",
          }).session(session);

        if (wallet) {
          return wallet;
        }
      }

      throw error;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Get Platform Wallet
  |--------------------------------------------------------------------------
  */

  static async getPlatformWallet({
    session = null,
  }) {
    const wallet =
      await Wallet.findOne({
        ownerType: "PLATFORM",
        status: "ACTIVE",
      }).session(session);

    if (!wallet) {
      throw new Error(
        "Active platform wallet was not found"
      );
    }

    return wallet;
  }

  /*
  |--------------------------------------------------------------------------
  | Generic Credit
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
    amount =
      this.assertValidAmount(amount);

    if (!reference) {
      throw new Error(
        "Ledger reference is required"
      );
    }

    if (!idempotencyKey) {
      throw new Error(
        "Ledger idempotencyKey is required"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | IDEMPOTENCY CHECK
    |--------------------------------------------------------------------------
    */

    const existingLedger =
      await Ledger.findOne({
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
    |--------------------------------------------------------------------------
    | LOAD WALLET
    |--------------------------------------------------------------------------
    */

    const lockedWallet =
      await Wallet.findById(
        wallet._id
      ).session(session);

    if (!lockedWallet) {
      throw new Error(
        `Wallet not found: ${wallet._id}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATE WALLET
    |--------------------------------------------------------------------------
    */

    if (
      lockedWallet.status !==
      "ACTIVE"
    ) {
      throw new Error(
        `Wallet is not active: ${lockedWallet._id}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | CURRENT BALANCES
    |--------------------------------------------------------------------------
    */

    const balanceBefore =
      Number(
        lockedWallet.availableBalance ||
        0
      );

    const pendingBefore =
      Number(
        lockedWallet.pendingBalance ||
        0
      );

    /*
    |--------------------------------------------------------------------------
    | NEW AVAILABLE BALANCE
    |--------------------------------------------------------------------------
    */

    const balanceAfter =
      balanceBefore + amount;

    /*
    |--------------------------------------------------------------------------
    | UPDATE WALLET
    |--------------------------------------------------------------------------
    */

    lockedWallet.availableBalance =
      balanceAfter;

    lockedWallet.totalEarned =
      Number(
        lockedWallet.totalEarned || 0
      ) + amount;

    lockedWallet.lastTransactionAt =
      new Date();

    await lockedWallet.save({
      session,
    });

    /*
    |--------------------------------------------------------------------------
    | CREATE LEDGER
    |--------------------------------------------------------------------------
    */

    const ledger =
      new Ledger({
        wallet:
          lockedWallet._id,

        owner:
          owner ||
          lockedWallet.owner,

        ownerType:
          ownerType ||
          lockedWallet.ownerType,

        entryType,

        direction: "CREDIT",

        amount,

        currency:
          payment?.currency ||
          lockedWallet.currency ||
          "NGN",

        availableBalanceBefore:
          balanceBefore,

        availableBalanceAfter:
          balanceAfter,

        pendingBalanceBefore:
          pendingBefore,

        pendingBalanceAfter:
          pendingBefore,

        totalBalanceBefore:
          balanceBefore +
          pendingBefore,

        totalBalanceAfter:
          balanceAfter +
          pendingBefore,

        status: "COMPLETED",

        reference,

        idempotencyKey,

        payment:
          payment?._id ||
          null,

        relatedLedger: null,

        externalReference:
          payment?.gatewayReference ||
          payment?.TransactionId ||
          payment?.txRef ||
          null,

        description,

        metadata,

        createdBy,

        completedAt:
          new Date(),
      });

    await ledger.save({
      session,
    });

    /*
    |--------------------------------------------------------------------------
    | RETURN
    |--------------------------------------------------------------------------
    */

    return {
      wallet: lockedWallet,

      ledger,

      duplicate: false,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Generic Debit
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
    amount =
      this.assertValidAmount(amount);

    if (!reference) {
      throw new Error(
        "Ledger reference is required"
      );
    }

    if (!idempotencyKey) {
      throw new Error(
        "Ledger idempotencyKey is required"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | IDEMPOTENCY CHECK
    |--------------------------------------------------------------------------
    */

    const existingLedger =
      await Ledger.findOne({
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
    |--------------------------------------------------------------------------
    | LOAD WALLET
    |--------------------------------------------------------------------------
    */

    const lockedWallet =
      await Wallet.findById(
        wallet._id
      ).session(session);

    if (!lockedWallet) {
      throw new Error(
        `Wallet not found: ${wallet._id}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATE WALLET
    |--------------------------------------------------------------------------
    */

    if (
      lockedWallet.status !==
      "ACTIVE"
    ) {
      throw new Error(
        `Wallet is not active: ${lockedWallet._id}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | CURRENT BALANCES
    |--------------------------------------------------------------------------
    */

    const balanceBefore =
      Number(
        lockedWallet.availableBalance ||
        0
      );

    const pendingBefore =
      Number(
        lockedWallet.pendingBalance ||
        0
      );

    /*
    |--------------------------------------------------------------------------
    | CHECK AVAILABLE BALANCE
    |--------------------------------------------------------------------------
    */

    if (balanceBefore < amount) {
      throw new Error(
        `Insufficient wallet balance. Available: ${balanceBefore}, requested: ${amount}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | NEW BALANCE
    |--------------------------------------------------------------------------
    */

    const balanceAfter =
      balanceBefore - amount;

    /*
    |--------------------------------------------------------------------------
    | UPDATE WALLET
    |--------------------------------------------------------------------------
    */

    lockedWallet.availableBalance =
      balanceAfter;

    lockedWallet.totalWithdrawn =
      Number(
        lockedWallet.totalWithdrawn ||
        0
      ) + amount;

    lockedWallet.lastTransactionAt =
      new Date();

    lockedWallet.lastWithdrawalAt =
      new Date();

    await lockedWallet.save({
      session,
    });

    /*
    |--------------------------------------------------------------------------
    | CREATE LEDGER
    |--------------------------------------------------------------------------
    */

    const ledger =
      new Ledger({
        wallet:
          lockedWallet._id,

        owner:
          owner ||
          lockedWallet.owner,

        ownerType:
          ownerType ||
          lockedWallet.ownerType,

        entryType,

        direction: "DEBIT",

        amount,

        currency:
          payment?.currency ||
          lockedWallet.currency ||
          "NGN",

        availableBalanceBefore:
          balanceBefore,

        availableBalanceAfter:
          balanceAfter,

        pendingBalanceBefore:
          pendingBefore,

        pendingBalanceAfter:
          pendingBefore,

        totalBalanceBefore:
          balanceBefore +
          pendingBefore,

        totalBalanceAfter:
          balanceAfter +
          pendingBefore,

        status: "COMPLETED",

        reference,

        idempotencyKey,

        payment:
          payment?._id ||
          null,

        relatedLedger: null,

        externalReference:
          payment?.gatewayReference ||
          payment?.TransactionId ||
          payment?.txRef ||
          null,

        description,

        metadata,

        createdBy,

        completedAt:
          new Date(),
      });

    await ledger.save({
      session,
    });

    /*
    |--------------------------------------------------------------------------
    | RETURN
    |--------------------------------------------------------------------------
    */

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
    amount =
      this.assertValidAmount(amount);

    if (!teacherId) {
      throw new Error(
        "Teacher ID is required"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | GET TEACHER WALLET
    |--------------------------------------------------------------------------
    */

    const wallet =
      await this.getOrCreateUserWallet({
        userId: teacherId,

        ownerType: "TEACHER",

        session,
      });

    /*
    |--------------------------------------------------------------------------
    | CREDIT TEACHER
    |--------------------------------------------------------------------------
    */

    return this.creditWallet({
      wallet,

      owner: teacherId,

      ownerType: "TEACHER",

      amount,

      payment,

      order,

      entryType:
        "COMMISSION",

      reference:
        `${payment.txRef}:TEACHER_COMMISSION`,

      idempotencyKey:
        `${payment._id}:TEACHER_COMMISSION`,

      description:
        `Teacher commission from student payment ${payment.txRef}`,

      metadata: {
        ...metadata,

        role: "TEACHER",

        commissionType:
          "STUDENT_PAYMENT",
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
    amount =
      this.assertValidAmount(amount);

    if (!adminId) {
      throw new Error(
        "Admin ID is required"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | GET ADMIN WALLET
    |--------------------------------------------------------------------------
    */

    const wallet =
      await this.getOrCreateUserWallet({
        userId: adminId,

        ownerType: "ADMIN",

        session,
      });

    /*
    |--------------------------------------------------------------------------
    | CREDIT ADMIN
    |--------------------------------------------------------------------------
    */

    return this.creditWallet({
      wallet,

      owner: adminId,

      ownerType: "ADMIN",

      amount,

      payment,

      order,

      entryType:
        "COMMISSION",

      reference:
        `${payment.txRef}:ADMIN_COMMISSION`,

      idempotencyKey:
        `${payment._id}:ADMIN_COMMISSION`,

      description:
        `Admin commission from student payment ${payment.txRef}`,

      metadata: {
        ...metadata,

        role: "ADMIN",

        commissionType:
          "STUDENT_PAYMENT",
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
    amount =
      this.assertValidAmount(amount);

    /*
    |--------------------------------------------------------------------------
    | GET PLATFORM WALLET
    |--------------------------------------------------------------------------
    */

    const wallet =
      await this.getPlatformWallet({
        session,
      });

    /*
    |--------------------------------------------------------------------------
    | CREDIT PLATFORM
    |--------------------------------------------------------------------------
    */

    return this.creditWallet({
      wallet,

      owner:
        wallet.owner,

      ownerType:
        "PLATFORM",

      amount,

      payment,

      order,

      entryType:
        "COMMISSION",

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
          transaction?.amount ||
          null,

        gatewayFee:
          transaction?.fees ||
          0,
      },

      session,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Generic Admin/Teacher Credit
  |--------------------------------------------------------------------------
  */

  static async creditUserWallet({
    userId,
    ownerType,
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
    if (
      !["TEACHER", "ADMIN"].includes(
        ownerType
      )
    ) {
      throw new Error(
        `Invalid ownerType: ${ownerType}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | GET WALLET
    |--------------------------------------------------------------------------
    */

    const wallet =
      await this.getOrCreateUserWallet({
        userId,

        ownerType,

        session,
      });

    /*
    |--------------------------------------------------------------------------
    | CREDIT
    |--------------------------------------------------------------------------
    */

    return this.creditWallet({
      wallet,

      owner: userId,

      ownerType,

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
    ownerType,
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
    if (
      !["TEACHER", "ADMIN"].includes(
        ownerType
      )
    ) {
      throw new Error(
        `Invalid ownerType: ${ownerType}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | GET WALLET
    |--------------------------------------------------------------------------
    */

    const wallet =
      await this.getOrCreateUserWallet({
        userId,

        ownerType,

        session,
      });

    /*
    |--------------------------------------------------------------------------
    | DEBIT
    |--------------------------------------------------------------------------
    */

    return this.debitWallet({
      wallet,

      owner: userId,

      ownerType,

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
  | Wallet Dashboard
  |--------------------------------------------------------------------------
  */

  static async getWalletDashboard(
    userId,
    ownerType = null
  ) {
    /*
    |--------------------------------------------------------------------------
    | VALIDATE OWNER TYPE
    |--------------------------------------------------------------------------
    */

    if (
      ownerType &&
      ![
        "TEACHER",
        "ADMIN",
      ].includes(ownerType)
    ) {
      throw new Error(
        `Invalid wallet ownerType: ${ownerType}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | BUILD QUERY
    |--------------------------------------------------------------------------
    */

    const query = {
      owner: userId,

      status: "ACTIVE",
    };

    if (ownerType) {
      query.ownerType =
        ownerType;
    } else {
      query.ownerType = {
        $in: [
          "TEACHER",
          "ADMIN",
        ],
      };
    }

    /*
    |--------------------------------------------------------------------------
    | GET WALLET
    |--------------------------------------------------------------------------
    */

    const wallet =
      await Wallet.findOne(
        query
      ).lean();

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

    /*
    |--------------------------------------------------------------------------
    | WALLET ID
    |--------------------------------------------------------------------------
    */

    const walletId =
      new mongoose.Types.ObjectId(
        wallet._id
      );

    /*
    |--------------------------------------------------------------------------
    | SUMMARY
    |--------------------------------------------------------------------------
    */

    const summary =
      await Ledger.aggregate([
        {
          $match: {
            wallet:
              walletId,

            status:
              "COMPLETED",
          },
        },

        {
          $group: {
            _id: null,

            credits: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$direction",
                      "CREDIT",
                    ],
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
                    $eq: [
                      "$direction",
                      "DEBIT",
                    ],
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

    /*
    |--------------------------------------------------------------------------
    | TRANSACTIONS
    |--------------------------------------------------------------------------
    */

    const transactions =
      await Ledger.find({
        wallet:
          wallet._id,
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

    /*
    |--------------------------------------------------------------------------
    | RETURN
    |--------------------------------------------------------------------------
    */

    return {
      wallet,

      summary:
        summary[0] || {
          credits: 0,

          debits: 0,

          commission: 0,
        },

      transactions,
    };
  }

  /*
|--------------------------------------------------------------------------
| Get All Wallets
|--------------------------------------------------------------------------
*/

static async getAllWallets({
  ownerType = null,
  status = null,
  search = null,
  page = 1,
  limit = 20,
} = {}) {

  const currentPage =
    Math.max(Number(page) || 1, 1);

  const perPage =
    Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

  const skip =
    (currentPage - 1) * perPage;

  /*
  |--------------------------------------------------------------------------
  | Wallet Query
  |--------------------------------------------------------------------------
  */

  const walletQuery = {};

  /*
  |--------------------------------------------------------------------------
  | Owner Type Filter
  |--------------------------------------------------------------------------
  */

  if (ownerType) {

    const normalizedType =
      String(ownerType).toUpperCase();

    if (
      ["TEACHER", "ADMIN", "PLATFORM"].includes(
        normalizedType
      )
    ) {
      walletQuery.ownerType =
        normalizedType;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Status Filter
  |--------------------------------------------------------------------------
  */

  if (status) {

    const normalizedStatus =
      String(status).toUpperCase();

    if (
      [
        "ACTIVE",
        "SUSPENDED",
        "LOCKED",
        "CLOSED",
      ].includes(normalizedStatus)
    ) {
      walletQuery.status =
        normalizedStatus;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Search User
  |--------------------------------------------------------------------------
  */

  let ownerIds = null;

  if (search) {

    const searchRegex =
      new RegExp(
        String(search).trim(),
        "i"
      );

    const users =
      await Usertp.find({
        $or: [
          {
            firstName: searchRegex,
          },
          {
            middleName: searchRegex,
          },
          {
            lastName: searchRegex,
          },
          {
            email: searchRegex,
          },
        ],
      })
        .select("_id")
        .lean();

    ownerIds =
      users.map(
        (user) => user._id
      );

    /*
    |--------------------------------------------------------------------------
    | If Search Has No Matching Users
    |--------------------------------------------------------------------------
    */

    if (!ownerIds.length) {

      return {
        wallets: [],
        pagination: {
          page: currentPage,
          limit: perPage,
          total: 0,
          pages: 0,
        },
      };
    }

    walletQuery.owner = {
      $in: ownerIds,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Count
  |--------------------------------------------------------------------------
  */

  const total =
    await Wallet.countDocuments(
      walletQuery
    );

  /*
  |--------------------------------------------------------------------------
  | Fetch Wallets
  |--------------------------------------------------------------------------
  */

  const wallets =
    await Wallet.find(walletQuery)
      .populate({
        path: "owner",
        select:
          "firstName middleName lastName email role",
      })
      .sort({
        updatedAt: -1,
      })
      .skip(skip)
      .limit(perPage)
      .lean();

  /*
  |--------------------------------------------------------------------------
  | Format For Frontend
  |--------------------------------------------------------------------------
  */

  const formattedWallets =
    wallets.map((wallet) => {

      const owner =
        wallet.owner || {};

      const firstName =
        owner.firstName || "";

      const middleName =
        owner.middleName || "";

      const lastName =
        owner.lastName || "";

      const fullName =
        [
          firstName,
          middleName,
          lastName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

      /*
      |--------------------------------------------------------------------------
      | Wallet Type
      |--------------------------------------------------------------------------
      */

      let type = "Admin";

      if (
        wallet.ownerType === "TEACHER"
      ) {
        type = "Teacher";
      }

      if (
        wallet.ownerType === "PLATFORM"
      ) {
        type = "Platform";
      }

      /*
      |--------------------------------------------------------------------------
      | Wallet Status
      |--------------------------------------------------------------------------
      */

      let formattedStatus =
        "Active";

      if (
        wallet.status === "SUSPENDED"
      ) {
        formattedStatus =
          "Suspended";
      }

      if (
        wallet.status === "LOCKED"
      ) {
        formattedStatus =
          "Suspended";
      }

      if (
        wallet.status === "CLOSED"
      ) {
        formattedStatus =
          "Suspended";
      }

      return {
        id: wallet._id,

        owner:
          fullName ||
          owner.email ||
          "Unknown User",

        email:
          owner.email ||
          "",

        type,

        balance:
          Number(
            wallet.availableBalance || 0
          ),

        pendingBalance:
          Number(
            wallet.pendingBalance || 0
          ),

        totalEarned:
          Number(
            wallet.totalEarned || 0
          ),

        totalWithdrawn:
          Number(
            wallet.totalWithdrawn || 0
          ),

        totalRefunded:
          Number(
            wallet.totalRefunded || 0
          ),

        status:
          formattedStatus,

        updatedAt:
          wallet.updatedAt,

        createdAt:
          wallet.createdAt,
      };
    });

  return {
    wallets: formattedWallets,

    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      pages:
        Math.ceil(
          total / perPage
        ),
    },
  };
}


/*
|--------------------------------------------------------------------------
| Get Single Wallet
|--------------------------------------------------------------------------
*/

static async getWalletById(
  walletId
) {

  if (!walletId) {
    throw new Error(
      "Wallet ID is required"
    );
  }

  const wallet =
    await Wallet.findById(walletId)
      .populate({
        path: "owner",
        select:
          "firstName middleName lastName email role",
      })
      .lean();

  if (!wallet) {
    throw new Error(
      "Wallet not found"
    );
  }

  const owner =
    wallet.owner || {};

  const fullName =
    [
      owner.firstName,
      owner.middleName,
      owner.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  let type = "Admin";

  if (
    wallet.ownerType === "TEACHER"
  ) {
    type = "Teacher";
  }

  if (
    wallet.ownerType === "PLATFORM"
  ) {
    type = "Platform";
  }

  let formattedStatus =
    "Active";

  if (
    wallet.status !== "ACTIVE"
  ) {
    formattedStatus =
      "Suspended";
  }

  return {
    id: wallet._id,

    owner:
      fullName ||
      owner.email ||
      "Unknown User",

    email:
      owner.email || "",

    type,

    balance:
      Number(
        wallet.availableBalance || 0
      ),

    pendingBalance:
      Number(
        wallet.pendingBalance || 0
      ),

    totalEarned:
      Number(
        wallet.totalEarned || 0
      ),

    totalWithdrawn:
      Number(
        wallet.totalWithdrawn || 0
      ),

    totalRefunded:
      Number(
        wallet.totalRefunded || 0
      ),

    status:
      formattedStatus,

    updatedAt:
      wallet.updatedAt,

    createdAt:
      wallet.createdAt,
  };
}


/*
|--------------------------------------------------------------------------
| Wallet Statistics
|--------------------------------------------------------------------------
*/

static async getWalletStatistics() {

  const result =
    await Wallet.aggregate([
      {
        $group: {
          _id: null,

          totalBalance: {
            $sum: "$availableBalance",
          },

          totalPendingBalance: {
            $sum: "$pendingBalance",
          },

          totalEarned: {
            $sum: "$totalEarned",
          },

          totalWithdrawn: {
            $sum: "$totalWithdrawn",
          },

          totalRefunded: {
            $sum: "$totalRefunded",
          },

          totalWallets: {
            $sum: 1,
          },

          activeWallets: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "ACTIVE",
                  ],
                },
                1,
                0,
              ],
            },
          },

          suspendedWallets: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "SUSPENDED",
                  ],
                },
                1,
                0,
              ],
            },
          },

          lockedWallets: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "LOCKED",
                  ],
                },
                1,
                0,
              ],
            },
          },

          closedWallets: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "CLOSED",
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

  const stats =
    result[0] || {};

  /*
  |--------------------------------------------------------------------------
  | Wallets By Type
  |--------------------------------------------------------------------------
  */

  const byType =
    await Wallet.aggregate([
      {
        $group: {
          _id: "$ownerType",

          count: {
            $sum: 1,
          },

          balance: {
            $sum: "$availableBalance",
          },

          earned: {
            $sum: "$totalEarned",
          },

          withdrawn: {
            $sum: "$totalWithdrawn",
          },
        },
      },
    ]);

  return {
    totalBalance:
      Number(
        stats.totalBalance || 0
      ),

    totalPendingBalance:
      Number(
        stats.totalPendingBalance || 0
      ),

    totalEarned:
      Number(
        stats.totalEarned || 0
      ),

    totalWithdrawn:
      Number(
        stats.totalWithdrawn || 0
      ),

    totalRefunded:
      Number(
        stats.totalRefunded || 0
      ),

    totalWallets:
      Number(
        stats.totalWallets || 0
      ),

    activeWallets:
      Number(
        stats.activeWallets || 0
      ),

    suspendedWallets:
      Number(
        stats.suspendedWallets || 0
      ),

    lockedWallets:
      Number(
        stats.lockedWallets || 0
      ),

    closedWallets:
      Number(
        stats.closedWallets || 0
      ),

    byType,
  };
}

/*
|--------------------------------------------------------------------------
| Ensure Wallet
|--------------------------------------------------------------------------
|
| Every admin, teacher and student can have one wallet.
|
*/


/* 
|--------------------------------------------------------------------------
| Ensure Wallet
|--------------------------------------------------------------------------
|
| Uses the existing Wallet structure:
|
| owner     -> Usercbt _id
| ownerType -> ADMIN / TEACHER
|
| This method supports:
|
| admin
| teacher
|
|--------------------------------------------------------------------------
*/

static async ensureWallet(
  userId,
  session = null
) {
  if (!userId) {
    throw new Error(
      "userId is required"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Get User
  |--------------------------------------------------------------------------
  */

  const user =
    await Usertp.findById(
      userId
    )
      .select(
        "_id role commissionPercentage"
      )
      .session(session);

  if (!user) {
    throw new Error(
      `User not found: ${userId}`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Convert User role to Wallet ownerType
  |--------------------------------------------------------------------------
  */

  let ownerType = null;

  if (
    user.role === "admin"
  ) {
    ownerType = "ADMIN";
  }

  if (
    user.role === "teacher"
  ) {
    ownerType = "TEACHER";
  }

  /*
  |--------------------------------------------------------------------------
  | Unsupported role
  |--------------------------------------------------------------------------
  */

  if (!ownerType) {
    throw new Error(
      `Wallet is not supported for role: ${user.role}`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Use Existing Wallet Creation Method
  |--------------------------------------------------------------------------
  |
  | getOrCreateUserWallet() already handles:
  |
  | - owner
  | - ownerType
  | - wallet creation
  | - duplicate wallet creation
  | - currency
  | - availableBalance
  | - pendingBalance
  | - totalEarned
  | - totalWithdrawn
  | - totalRefunded
  |
  |--------------------------------------------------------------------------
  */

  return await this.getOrCreateUserWallet({
    userId: user._id,

    ownerType,

    session,
  });
}



































































/* ================================================================
 * REQUEST WITHDRAWAL
 * ================================================================ */

static async requestWithdrawal({
  userId,
  amount,
  metadata = {},
  session,
}) {
  /*
   * --------------------------------------------------------------
   * GET USER
   * --------------------------------------------------------------
   */

  const user = await Usertp
    .findById(userId)
    .session(session);

  if (!user) {
    throw new Error("User not found");
  }


  /*
   * --------------------------------------------------------------
   * OWNER TYPE
   * --------------------------------------------------------------
   */

  let ownerType;

  if (user.role === "teacher") {
    ownerType = "TEACHER";
  } else if (user.role === "admin") {
    ownerType = "ADMIN";
  } else {
    throw new Error(
      "Only teachers and admins can request withdrawal"
    );
  }


  /*
   * --------------------------------------------------------------
   * VALIDATE AMOUNT
   *
   * Amount is KOBO.
   *
   * Example:
   * ₦5,000 = 500,000
   * --------------------------------------------------------------
   */

  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid withdrawal amount"
    );
  }


  /*
   * Minimum withdrawal
   *
   * ₦5,000 = 500,000 kobo
   *
   * Keep disabled if you don't want minimum enforcement.
   */

  
  if (amount < 200000) {
    throw new Error(
      "Minimum withdrawal is ₦5,000"
    );
  }
  


  /*
   * --------------------------------------------------------------
   * GET USER WALLET
   * --------------------------------------------------------------
   */

  const wallet =
    await this.getOrCreateUserWallet({
      userId,
      ownerType,
      session,
    });

  if (!wallet) {
    throw new Error(
      "Wallet not found"
    );
  }


  /*
   * --------------------------------------------------------------
   * WALLET STATUS
   * --------------------------------------------------------------
   */

  if (wallet.status !== "ACTIVE") {
    throw new Error(
      "Wallet is not active"
    );
  }


  /*
   * --------------------------------------------------------------
   * BANK ACCOUNT
   * --------------------------------------------------------------
   */

  const bank =
    wallet.bankDetails;


  if (
    !bank?.bankName ||
    !bank?.accountName ||
    !bank?.accountNumber
  ) {
    throw new Error(
      "Bank account is not configured"
    );
  }


  /*
   * --------------------------------------------------------------
   * CURRENT BALANCES
   *
   * SAVE THESE BEFORE CHANGING WALLET
   * --------------------------------------------------------------
   */

  const availableBalanceBefore =
    Number(
      wallet.availableBalance || 0
    );

  const pendingBalanceBefore =
    Number(
      wallet.pendingBalance || 0
    );


  /*
   * --------------------------------------------------------------
   * CHECK AVAILABLE BALANCE
   * --------------------------------------------------------------
   */

  if (
    availableBalanceBefore < amount
  ) {
    throw new Error(
      `Insufficient available balance. Available: ${availableBalanceBefore}, requested: ${amount}`
    );
  }


  /*
   * --------------------------------------------------------------
   * NEW BALANCES
   *
   * Requesting withdrawal:
   *
   * availableBalance ↓
   * pendingBalance   ↑
   *
   * totalWithdrawn stays unchanged.
   * --------------------------------------------------------------
   */

  const availableBalanceAfter =
    availableBalanceBefore - amount;

  const pendingBalanceAfter =
    pendingBalanceBefore + amount;


  /*
   * --------------------------------------------------------------
   * RESERVE MONEY
   * --------------------------------------------------------------
   */

  wallet.availableBalance =
    availableBalanceAfter;

  wallet.pendingBalance =
    pendingBalanceAfter;

  wallet.lastTransactionAt =
    new Date();

  await wallet.save({
    session,
  });


  /*
   * --------------------------------------------------------------
   * GENERATE WITHDRAWAL REFERENCE
   * --------------------------------------------------------------
   */

  const reference =
    `WD-${Date.now()}-${String(
      user._id
    ).slice(-6)}-${Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase()}`;


  /*
   * --------------------------------------------------------------
   * CREATE REQUEST LEDGER
   *
   * IMPORTANT:
   * Ledger field names must match Ledger.js.
   * --------------------------------------------------------------
   */

  const [ledger] =
    await Ledger.create(
      [
        {
          wallet:
            wallet._id,

          owner:
            user._id,

          ownerType,

          entryType:
            "WITHDRAWAL",

          direction:
            "DEBIT",

          amount,

          currency:
            wallet.currency || "NGN",


          /*
           * AVAILABLE BALANCE
           */

          availableBalanceBefore:
            availableBalanceBefore,

          availableBalanceAfter:
            availableBalanceAfter,


          /*
           * PENDING BALANCE
           */

          pendingBalanceBefore:
            pendingBalanceBefore,

          pendingBalanceAfter:
            pendingBalanceAfter,


          /*
           * TOTAL BALANCE
           */

          totalBalanceBefore:
            availableBalanceBefore +
            pendingBalanceBefore,

          totalBalanceAfter:
            availableBalanceAfter +
            pendingBalanceAfter,


          /*
           * REQUEST IS PENDING
           */

          status:
            "PENDING",

          reference:
            `${reference}:REQUEST`,

          idempotencyKey:
            `${reference}:REQUEST`,


          /*
           * No payment attached
           */

          payment:
            null,

          relatedLedger:
            null,

          externalReference:
            null,


          description:
            "Withdrawal request",


          metadata: {
            ...metadata,

            bankName:
              bank.bankName,

            accountName:
              bank.accountName,

            accountNumber:
              this.maskAccountNumber
                ? this.maskAccountNumber(
                    bank.accountNumber
                  )
                : `******${String(
                    bank.accountNumber
                  ).slice(-4)}`,
          },


          createdBy:
            user._id,

          completedAt:
            null,
        },
      ],
      {
        session,
      }
    );


  /*
   * --------------------------------------------------------------
   * CREATE WITHDRAWAL DOCUMENT
   * --------------------------------------------------------------
   */

  const [withdrawal] =
    await Withdrawal.create(
      [
        {
          wallet:
            wallet._id,

          owner:
            user._id,

          ownerType,

          amount,

          bankName:
            bank.bankName,

          accountName:
            bank.accountName,

          accountNumber:
            bank.accountNumber,

          status:
            "Pending",

          requestedAt:
            new Date(),

          reference,

          requestLedger:
            ledger._id,

          metadata,
        },
      ],
      {
        session,
      }
    );


  /*
   * --------------------------------------------------------------
   * RETURN
   * --------------------------------------------------------------
   */

  return {
    withdrawal,

    wallet,

    ledger,
  };
}



/* ================================================================
 * APPROVE WITHDRAWAL
 * ================================================================ */

static async approveWithdrawal({
  withdrawalId,
  superAdminId,
  metadata = {},
}) {
  const session =
    await mongoose.startSession();

  try {
    let result = null;


    /*
     * ------------------------------------------------------------
     * TRANSACTION
     * ------------------------------------------------------------
     */

    await session.withTransaction(
      async () => {


        /*
         * --------------------------------------------------------
         * FIND WITHDRAWAL
         * --------------------------------------------------------
         */

        const withdrawal =
          await Withdrawal.findById(
            withdrawalId
          ).session(session);


        if (!withdrawal) {
          throw new Error(
            "Withdrawal not found"
          );
        }


        /*
         * Only Pending can be approved
         */

        if (
          withdrawal.status !==
          "Pending"
        ) {
          throw new Error(
            "Withdrawal has already been processed"
          );
        }


        /*
         * --------------------------------------------------------
         * FIND WALLET
         * --------------------------------------------------------
         */

        const wallet =
          await Wallet.findById(
            withdrawal.wallet
          ).session(session);


        if (!wallet) {
          throw new Error(
            "Wallet not found"
          );
        }


        /*
         * --------------------------------------------------------
         * CHECK RESERVED MONEY
         * --------------------------------------------------------
         */

        const pendingBalanceBefore =
          Number(
            wallet.pendingBalance || 0
          );


        if (
          pendingBalanceBefore <
          withdrawal.amount
        ) {
          throw new Error(
            "Reserved withdrawal amount is not available"
          );
        }


        /*
         * --------------------------------------------------------
         * CURRENT AVAILABLE BALANCE
         *
         * IMPORTANT:
         *
         * We DO NOT reduce availableBalance
         * again here.
         * --------------------------------------------------------
         */

        const availableBalanceBefore =
          Number(
            wallet.availableBalance || 0
          );


        /*
         * --------------------------------------------------------
         * NEW BALANCES
         * --------------------------------------------------------
         */

        const availableBalanceAfter =
          availableBalanceBefore;


        const pendingBalanceAfter =
          pendingBalanceBefore -
          withdrawal.amount;


        /*
         * --------------------------------------------------------
         * PROCESSING
         * --------------------------------------------------------
         */

        withdrawal.status =
          "Processing";


        await withdrawal.save({
          session,
        });


        /*
         * --------------------------------------------------------
         * FINALIZE WALLET
         * --------------------------------------------------------
         */

        wallet.pendingBalance =
          pendingBalanceAfter;

        wallet.totalWithdrawn =
          Number(
            wallet.totalWithdrawn || 0
          ) +
          withdrawal.amount;

        wallet.lastTransactionAt =
          new Date();

        wallet.lastWithdrawalAt =
          new Date();


        await wallet.save({
          session,
        });


        /*
         * --------------------------------------------------------
         * APPROVAL LEDGER
         * --------------------------------------------------------
         */

        const [ledger] =
          await Ledger.create(
            [
              {
                wallet:
                  wallet._id,

                owner:
                  withdrawal.owner,

                ownerType:
                  withdrawal.ownerType,

                entryType:
                  "WITHDRAWAL",

                direction:
                  "DEBIT",

                amount:
                  withdrawal.amount,

                currency:
                  wallet.currency ||
                  "NGN",


                /*
                 * AVAILABLE DID NOT CHANGE
                 */

                availableBalanceBefore:
                  availableBalanceBefore,

                availableBalanceAfter:
                  availableBalanceAfter,


                /*
                 * PENDING DECREASED
                 */

                pendingBalanceBefore:
                  pendingBalanceBefore,

                pendingBalanceAfter:
                  pendingBalanceAfter,


                /*
                 * TOTAL BALANCE
                 */

                totalBalanceBefore:
                  availableBalanceBefore +
                  pendingBalanceBefore,

                totalBalanceAfter:
                  availableBalanceAfter +
                  pendingBalanceAfter,


                status:
                  "COMPLETED",

                reference:
                  `${withdrawal.reference}:APPROVED`,

                idempotencyKey:
                  `${withdrawal.reference}:APPROVED`,

                payment:
                  null,

                relatedLedger:
                  withdrawal.requestLedger,

                externalReference:
                  null,

                description:
                  "Withdrawal approved",

                metadata: {
                  ...metadata,

                  approvedBy:
                    superAdminId,
                },

                createdBy:
                  superAdminId,

                completedAt:
                  new Date(),
              },
            ],
            {
              session,
            }
          );


        /*
         * --------------------------------------------------------
         * COMPLETE WITHDRAWAL
         * --------------------------------------------------------
         */

        withdrawal.status =
          "Completed";

        withdrawal.processedAt =
          new Date();

        withdrawal.approvedBy =
          superAdminId;

        withdrawal.approvedAt =
          new Date();

        withdrawal.settlementLedger =
          ledger._id;


        await withdrawal.save({
          session,
        });


        /*
         * --------------------------------------------------------
         * RETURN DATA
         * --------------------------------------------------------
         */

        result = {
          withdrawal,

          wallet,

          ledger,
        };
      }
    );


    return result;

  } finally {
    await session.endSession();
  }
}



/* ================================================================
 * REJECT WITHDRAWAL
 * ================================================================ */

static async rejectWithdrawal({
  withdrawalId,
  superAdminId,
  rejectionReason,
  metadata = {},
}) {
  const session =
    await mongoose.startSession();

  try {
    let result = null;


    /*
     * ------------------------------------------------------------
     * TRANSACTION
     * ------------------------------------------------------------
     */

    await session.withTransaction(
      async () => {


        /*
         * --------------------------------------------------------
         * FIND WITHDRAWAL
         * --------------------------------------------------------
         */

        const withdrawal =
          await Withdrawal.findById(
            withdrawalId
          ).session(session);


        if (!withdrawal) {
          throw new Error(
            "Withdrawal not found"
          );
        }


        /*
         * Only Pending can be rejected
         */

        if (
          withdrawal.status !==
          "Pending"
        ) {
          throw new Error(
            "Withdrawal has already been processed"
          );
        }


        /*
         * --------------------------------------------------------
         * FIND WALLET
         * --------------------------------------------------------
         */

        const wallet =
          await Wallet.findById(
            withdrawal.wallet
          ).session(session);


        if (!wallet) {
          throw new Error(
            "Wallet not found"
          );
        }


        /*
         * --------------------------------------------------------
         * CHECK RESERVED MONEY
         * --------------------------------------------------------
         */

        const pendingBalanceBefore =
          Number(
            wallet.pendingBalance || 0
          );


        if (
          pendingBalanceBefore <
          withdrawal.amount
        ) {
          throw new Error(
            "Reserved withdrawal amount is not available"
          );
        }


        /*
         * --------------------------------------------------------
         * CURRENT BALANCE
         * --------------------------------------------------------
         */

        const availableBalanceBefore =
          Number(
            wallet.availableBalance || 0
          );


        /*
         * --------------------------------------------------------
         * RETURN MONEY
         * --------------------------------------------------------
         *
         * Rejection releases the reserved
         * withdrawal amount.
         */

        const availableBalanceAfter =
          availableBalanceBefore +
          withdrawal.amount;


        const pendingBalanceAfter =
          pendingBalanceBefore -
          withdrawal.amount;


        /*
         * --------------------------------------------------------
         * UPDATE WALLET
         * --------------------------------------------------------
         */

        wallet.availableBalance =
          availableBalanceAfter;

        wallet.pendingBalance =
          pendingBalanceAfter;

        wallet.lastTransactionAt =
          new Date();


        await wallet.save({
          session,
        });


        /*
         * --------------------------------------------------------
         * CREATE REVERSAL LEDGER
         * --------------------------------------------------------
         */

        const [ledger] =
          await Ledger.create(
            [
              {
                wallet:
                  wallet._id,

                owner:
                  withdrawal.owner,

                ownerType:
                  withdrawal.ownerType,

                entryType:
                  "REVERSAL",

                direction:
                  "CREDIT",

                amount:
                  withdrawal.amount,

                currency:
                  wallet.currency ||
                  "NGN",


                /*
                 * AVAILABLE BALANCE
                 */

                availableBalanceBefore:
                  availableBalanceBefore,

                availableBalanceAfter:
                  availableBalanceAfter,


                /*
                 * PENDING BALANCE
                 */

                pendingBalanceBefore:
                  pendingBalanceBefore,

                pendingBalanceAfter:
                  pendingBalanceAfter,


                /*
                 * TOTAL BALANCE
                 */

                totalBalanceBefore:
                  availableBalanceBefore +
                  pendingBalanceBefore,

                totalBalanceAfter:
                  availableBalanceAfter +
                  pendingBalanceAfter,


                status:
                  "COMPLETED",

                reference:
                  `${withdrawal.reference}:REJECTED`,

                idempotencyKey:
                  `${withdrawal.reference}:REJECTED`,

                payment:
                  null,

                relatedLedger:
                  withdrawal.requestLedger,

                externalReference:
                  null,

                description:
                  "Withdrawal rejected and funds released",

                metadata: {
                  ...metadata,

                  rejectedBy:
                    superAdminId,

                  rejectionReason:
                    rejectionReason || "",
                },

                createdBy:
                  superAdminId,

                completedAt:
                  new Date(),
              },
            ],
            {
              session,
            }
          );


        /*
         * --------------------------------------------------------
         * COMPLETE REJECTION
         * --------------------------------------------------------
         */

        withdrawal.status =
          "Rejected";

        withdrawal.rejectionReason =
          rejectionReason || "";

        withdrawal.rejectedBy =
          superAdminId;

        withdrawal.rejectedAt =
          new Date();

        withdrawal.processedAt =
          new Date();

        withdrawal.reversalLedger =
          ledger._id;


        await withdrawal.save({
          session,
        });


        /*
         * --------------------------------------------------------
         * RETURN DATA
         * --------------------------------------------------------
         */

        result = {
          withdrawal,

          wallet,

          ledger,
        };
      }
    );


    return result;

  } finally {
    await session.endSession();
  }
}

}

export default WalletService;