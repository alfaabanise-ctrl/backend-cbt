
import mongoose from "mongoose";

import Wallet from "../../model/Wallet.js";
import Ledger from "../../model/Ledger.js";
import Withdrawal from "../../model/Withdrawal.js";
import Usertp from "../../model/Users.js";

/*
|--------------------------------------------------------------------------
| ADMIN WALLET CONTROLLER
|--------------------------------------------------------------------------
|
| Wallet  = current wallet state
| Ledger  = permanent financial history
| Withdrawal = withdrawal requests
|
| IMPORTANT:
|
| All wallet/Ledger amounts are KOBO.
|
| 30,000  = ₦300
| 500,000 = ₦5,000
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const MINIMUM_WITHDRAWAL_KOBO = 500000;

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const roundMoney = (value) => {
  return (
    Math.round(
      Number(value || 0)
    ) / 100
  ) * 100;
};

const toNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
};

const buildName = (user) => {
  return [
    user?.firstName,
    user?.middleName,
    user?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
};

const maskAccountNumber = (
  accountNumber
) => {
  const value = String(
    accountNumber || ""
  ).replace(/\s+/g, "");

  if (!value) {
    return "";
  }

  if (value.length <= 4) {
    return `**** ${value}`;
  }

  return `**** ${value.slice(-4)}`;
};

/*
|--------------------------------------------------------------------------
| Verify Admin
|--------------------------------------------------------------------------
*/

const getAdmin = async (userId) => {
  if (!userId) {
    return null;
  }

  return await Usertp.findOne({
    _id: userId,
    role: "admin",
  })
    .select(
      "_id firstName middleName lastName email commissionPercentage"
    )
    .lean();
};

/*
|--------------------------------------------------------------------------
| Get Admin Wallet
|--------------------------------------------------------------------------
|
| Find existing wallet.
|
| If no wallet exists, create one.
|
|--------------------------------------------------------------------------
*/

const getOrCreateAdminWallet = async (
  adminId
) => {
  let wallet =
    await Wallet.findOne({
      owner: adminId,
      ownerType: "ADMIN",
    });

  if (wallet) {
    return wallet;
  }

  try {
    wallet =
      await Wallet.create({
        owner: adminId,
        ownerType: "ADMIN",

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
      });

    return wallet;
  } catch (error) {
    /*
     * Another request may have created it.
     */
    if (
      error?.code === 11000
    ) {
      wallet =
        await Wallet.findOne({
          owner: adminId,
          ownerType: "ADMIN",
        });

      if (wallet) {
        return wallet;
      }
    }

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| GET WALLET DASHBOARD
|--------------------------------------------------------------------------
|
| GET /admin/wallet
|
|--------------------------------------------------------------------------
*/

export const getWalletDashboard =
  async (req, res) => {
    try {
      const adminId =
        req.user?._id;

      /*
       * Verify admin
       */
      const admin =
        await getAdmin(
          adminId
        );

      if (!admin) {
        return res.status(403).json({
          success: false,
          message:
            "Admin account not found.",
        });
      }

      /*
       * Get wallet
       */
      const wallet =
        await getOrCreateAdminWallet(
          adminId
        );

      /*
       * Convert wallet id to ObjectId
       */
      const walletId =
        new mongoose.Types.ObjectId(
          wallet._id
        );

      /*
       |--------------------------------------------------------------------------
       | Ledger summary
       |--------------------------------------------------------------------------
       */

      const ledgerSummary =
        await Ledger.aggregate([
          {
            $match: {
              wallet: walletId,

              status:
                "COMPLETED",
            },
          },

          {
            $group: {
              _id: null,

              totalCredits: {
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

              totalDebits: {
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

              totalCommission: {
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
       | Pending commission
       |--------------------------------------------------------------------------
       */

      const pendingCommissionResult =
        await Ledger.aggregate([
          {
            $match: {
              wallet: walletId,

              entryType:
                "COMMISSION",

              direction:
                "CREDIT",

              status:
                "PENDING",
            },
          },

          {
            $group: {
              _id: null,

              total: {
                $sum: "$amount",
              },
            },
          },
        ]);

      /*
       |--------------------------------------------------------------------------
       | Withdrawal summary
       |--------------------------------------------------------------------------
       */

      const withdrawalSummary =
        await Withdrawal.aggregate([
          {
            $match: {
              wallet:
                walletId,
            },
          },

          {
            $group: {
              _id: null,

              completed: {
                $sum: {
                  $cond: [
                    {
                      $eq: [
                        "$status",
                        "Completed",
                      ],
                    },

                    "$amount",

                    0,
                  ],
                },
              },

              pending: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        "$status",
                        [
                          "Pending",
                          "Processing",
                        ],
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
       | Recent Ledger
       |--------------------------------------------------------------------------
       */

      const ledgerRows =
        await Ledger.find({
          wallet:
            wallet._id,
        })
          .sort({
            createdAt: -1,
          })
          .limit(50)
          .lean();

      /*
       |--------------------------------------------------------------------------
       | Recent Withdrawals
       |--------------------------------------------------------------------------
       */

      const withdrawalRows =
        await Withdrawal.find({
          wallet:
            wallet._id,
        })
          .sort({
            createdAt: -1,
          })
          .limit(20)
          .lean();

      const summary =
        ledgerSummary[0] || {};

      const withdrawal =
        withdrawalSummary[0] || {};

      const totalCredits =
        toNumber(
          summary.totalCredits
        );

      const totalDebits =
        toNumber(
          summary.totalDebits
        );

      const totalCommission =
        toNumber(
          summary.totalCommission
        );

      const pendingCommission =
        toNumber(
          pendingCommissionResult[0]
            ?.total
        );

      const totalWithdrawn =
        toNumber(
          withdrawal.completed
        );

      const pendingWithdrawal =
        toNumber(
          withdrawal.pending
        );

      /*
       |--------------------------------------------------------------------------
       | Format Ledger
       |--------------------------------------------------------------------------
       */

      const transactions =
        ledgerRows.map(
          (entry) => ({
            id: String(
              entry._id
            ),

            type:
              entry.entryType ===
              "COMMISSION"
                ? "Commission"
                : entry.entryType ===
                    "WITHDRAWAL"
                  ? "Withdrawal"
                  : entry.entryType ===
                      "REFUND"
                    ? "Refund"
                    : "Adjustment",

            description:
              entry.description ||
              entry.entryType,

            source:
              entry.metadata
                ?.source ||
              entry.metadata
                ?.studentName ||
              entry.owner
                ? String(
                    entry.owner
                  )
                : "",

            amount:
              toNumber(
                entry.amount
              ),

            direction:
              entry.direction ===
              "CREDIT"
                ? "Credit"
                : "Debit",

            status:
              entry.status ===
              "COMPLETED"
                ? "Completed"
                : entry.status ===
                    "PENDING"
                  ? "Pending"
                  : "Failed",

            date:
              entry.createdAt,

            reference:
              entry.reference,
          })
        );

      /*
       |--------------------------------------------------------------------------
       | Format Withdrawals
       |--------------------------------------------------------------------------
       */

      const withdrawals =
        withdrawalRows.map(
          (item) => ({
            id: String(
              item._id
            ),

            amount:
              toNumber(
                item.amount
              ),

            bankName:
              item.bankName,

            accountName:
              item.accountName,

            accountNumber:
              maskAccountNumber(
                item.accountNumber
              ),

            status:
              item.status,

            requestedAt:
              item.requestedAt,

            processedAt:
              item.processedAt,

            reference:
              item.reference,
          })
        );

      /*
       |--------------------------------------------------------------------------
       | Response
       |--------------------------------------------------------------------------
       */

      return res.json({
        success: true,

        user: {
          id:
            admin._id,

          name:
            buildName(admin),

          email:
            admin.email,

          role:
            admin.role,
        },

        wallet: {
          id:
            wallet._id,

          owner:
            wallet.owner,

          ownerType:
            wallet.ownerType,

          /*
           * Stored in KOBO.
           */
          balance:
            toNumber(
              wallet.availableBalance
            ),

          pendingBalance:
            toNumber(
              wallet.pendingBalance
            ),

          totalEarned:
            totalCommission,

          totalWithdrawn:
            totalWithdrawn,

          pendingWithdrawal:
            pendingWithdrawal,

          totalRefunded:
            toNumber(
              wallet.totalRefunded
            ),

          totalCredits:
            totalCredits,

          totalDebits:
            totalDebits,

          commissionRate:
            toNumber(
              admin.commissionPercentage
            ),

          pendingCommission:
            pendingCommission,

          status:
            wallet.status,
        },

        transactions,

        withdrawals,

        minimumWithdrawal:
          MINIMUM_WITHDRAWAL_KOBO,

        permissions: {
          canHaveWallet:
            true,

          canReceiveCommission:
            true,

          canWithdraw:
            wallet.status ===
            "ACTIVE",
        },
      });
    } catch (error) {
      console.error(
        "getWalletDashboard error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to load wallet.",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET WALLET TRANSACTIONS
|--------------------------------------------------------------------------
|
| GET /admin/wallet/transactions
|
|--------------------------------------------------------------------------
*/

export const getWalletTransactions =
  async (req, res) => {
    try {
      const admin =
        await getAdmin(
          req.user?._id
        );

      if (!admin) {
        return res.status(403).json({
          success: false,
          message:
            "Admin account not found.",
        });
      }

      const wallet =
        await getOrCreateAdminWallet(
          admin._id
        );

      let {
        page = 1,
        limit = 20,
        type,
        status,
        search,
      } = req.query;

      page =
        Math.max(
          Number(page) || 1,
          1
        );

      limit =
        Math.min(
          Math.max(
            Number(limit) || 20,
            1
          ),
          100
        );

      const query = {
        wallet:
          wallet._id,
      };

      /*
       * Entry type
       */
      if (
        type &&
        type !== "All Types"
      ) {
        const typeMap = {
          Commission:
            "COMMISSION",

          Withdrawal:
            "WITHDRAWAL",

          Refund:
            "REFUND",

          Adjustment:
            "ADJUSTMENT",
        };

        if (
          typeMap[type]
        ) {
          query.entryType =
            typeMap[type];
        }
      }

      /*
       * Status
       */
      if (
        status &&
        status !== "All Status"
      ) {
        const statusMap = {
          Completed:
            "COMPLETED",

          Pending:
            "PENDING",

          Failed:
            "FAILED",
        };

        if (
          statusMap[status]
        ) {
          query.status =
            statusMap[status];
        }
      }

      /*
       * Search
       */
      if (
        search &&
        String(search).trim()
      ) {
        const regex =
          new RegExp(
            String(search).trim(),
            "i"
          );

        query.$or = [
          {
            description:
              regex,
          },

          {
            reference:
              regex,
          },

          {
            externalReference:
              regex,
          },
        ];
      }

      const skip =
        (page - 1) *
        limit;

      const [
        rows,
        total,
      ] = await Promise.all([
        Ledger.find(query)
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Ledger.countDocuments(
          query
        ),
      ]);

      const transactions =
        rows.map(
          (entry) => ({
            id: String(
              entry._id
            ),

            type:
              entry.entryType ===
              "COMMISSION"
                ? "Commission"
                : entry.entryType ===
                    "WITHDRAWAL"
                  ? "Withdrawal"
                  : entry.entryType ===
                      "REFUND"
                    ? "Refund"
                    : "Adjustment",

            description:
              entry.description ||
              entry.entryType,

            source:
              entry.metadata
                ?.studentName ||
              entry.metadata
                ?.source ||
              "",

            amount:
              toNumber(
                entry.amount
              ),

            direction:
              entry.direction ===
              "CREDIT"
                ? "Credit"
                : "Debit",

            status:
              entry.status ===
              "COMPLETED"
                ? "Completed"
                : entry.status ===
                    "PENDING"
                  ? "Pending"
                  : "Failed",

            date:
              entry.createdAt,

            reference:
              entry.reference,
          })
        );

      return res.json({
        success: true,

        transactions,

        pagination: {
          page,

          limit,

          total,

          totalPages:
            Math.ceil(
              total / limit
            ),
        },
      });
    } catch (error) {
      console.error(
        "getWalletTransactions error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to load wallet transactions.",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET WITHDRAWALS
|--------------------------------------------------------------------------
|
| GET /admin/wallet/withdrawals
|
|--------------------------------------------------------------------------
*/

export const getWalletWithdrawals =
  async (req, res) => {
    try {
      const admin =
        await getAdmin(
          req.user?._id
        );

      if (!admin) {
        return res.status(403).json({
          success: false,
          message:
            "Admin account not found.",
        });
      }

      const wallet =
        await getOrCreateAdminWallet(
          admin._id
        );

      let {
        page = 1,
        limit = 20,
        status,
        search,
      } = req.query;

      page =
        Math.max(
          Number(page) || 1,
          1
        );

      limit =
        Math.min(
          Math.max(
            Number(limit) || 20,
            1
          ),
          100
        );

      const query = {
        wallet:
          wallet._id,
      };

      /*
       * Status
       */
      if (
        status &&
        status !== "All Status"
      ) {
        const allowedStatuses = [
          "Pending",
          "Processing",
          "Completed",
          "Rejected",
        ];

        if (
          allowedStatuses.includes(
            status
          )
        ) {
          query.status =
            status;
        }
      }

      /*
       * Search
       */
      if (
        search &&
        String(search).trim()
      ) {
        const regex =
          new RegExp(
            String(search).trim(),
            "i"
          );

        query.$or = [
          {
            reference:
              regex,
          },

          {
            bankName:
              regex,
          },

          {
            accountName:
              regex,
          },
        ];
      }

      const skip =
        (page - 1) *
        limit;

      const [
        rows,
        total,
      ] = await Promise.all([
        Withdrawal.find(
          query
        )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Withdrawal.countDocuments(
          query
        ),
      ]);

      const withdrawals =
        rows.map(
          (item) => ({
            id: String(
              item._id
            ),

            amount:
              toNumber(
                item.amount
              ),

            bankName:
              item.bankName,

            accountName:
              item.accountName,

            accountNumber:
              maskAccountNumber(
                item.accountNumber
              ),

            status:
              item.status,

            requestedAt:
              item.requestedAt,

            processedAt:
              item.processedAt,

            reference:
              item.reference,
          })
        );

      return res.json({
        success: true,

        withdrawals,

        pagination: {
          page,

          limit,

          total,

          totalPages:
            Math.ceil(
              total / limit
            ),
        },
      });
    } catch (error) {
      console.error(
        "getWalletWithdrawals error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to load withdrawals.",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET ONE WITHDRAWAL
|--------------------------------------------------------------------------
|
| GET /admin/wallet/withdrawals/:withdrawalId
|
|--------------------------------------------------------------------------
*/

export const getWithdrawal =
  async (req, res) => {
    try {
      const admin =
        await getAdmin(
          req.user?._id
        );

      if (!admin) {
        return res.status(403).json({
          success: false,
          message:
            "Admin account not found.",
        });
      }

      const wallet =
        await getOrCreateAdminWallet(
          admin._id
        );

      const withdrawal =
        await Withdrawal.findOne({
          _id:
            req.params
              .withdrawalId,

          wallet:
            wallet._id,
        }).lean();

      if (!withdrawal) {
        return res.status(404).json({
          success: false,

          message:
            "Withdrawal not found.",
        });
      }

      return res.json({
        success: true,

        withdrawal: {
          id: String(
            withdrawal._id
          ),

          amount:
            toNumber(
              withdrawal.amount
            ),

          bankName:
            withdrawal.bankName,

          accountName:
            withdrawal.accountName,

          accountNumber:
            maskAccountNumber(
              withdrawal.accountNumber
            ),

          status:
            withdrawal.status,

          requestedAt:
            withdrawal.requestedAt,

          processedAt:
            withdrawal.processedAt,

          reference:
            withdrawal.reference,

          rejectionReason:
            withdrawal.rejectionReason ||
            "",
        },
      });
    } catch (error) {
      console.error(
        "getWithdrawal error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to load withdrawal.",
      });
    }
  };

/*
|--------------------------------------------------------------------------
| REQUEST WITHDRAWAL
|--------------------------------------------------------------------------
|
| POST /admin/wallet/withdrawals
|
| Body:
|
| {
|   "amount": 500000
| }
|
| 500000 kobo = ₦5,000
|
|--------------------------------------------------------------------------
*/

export const requestWithdrawal =
  async (req, res) => {
    try {
      const admin =
        await getAdmin(
          req.user?._id
        );

      if (!admin) {
        return res.status(403).json({
          success: false,
          message:
            "Admin account not found.",
        });
      }

      /*
       * Get wallet
       */
      const wallet =
        await getOrCreateAdminWallet(
          admin._id
        );

      /*
       * Wallet must be active.
       */
      if (
        wallet.status !==
        "ACTIVE"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Wallet is not active.",
        });
      }

      /*
       * Amount is KOBO.
       */
      const amount =
        Number(
          req.body?.amount
        );

      if (
        !Number.isInteger(
          amount
        ) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Enter a valid withdrawal amount in kobo.",
        });
      }

      /*
       * Minimum = ₦5,000
       */
      if (
        amount <
        MINIMUM_WITHDRAWAL_KOBO
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Minimum withdrawal is ₦5,000.",
        });
      }

      /*
       * Get bank details from Wallet.
       *
       * This is now consistent with your
       * Wallet.js schema.
       */
      const bank =
        wallet.bankDetails || {};

      if (
        !bank.bankName ||
        !bank.accountName ||
        !bank.accountNumber
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Please complete your bank details before requesting a withdrawal.",
        });
      }

      if (
        bank.verified !==
        true
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Your bank account must be verified before withdrawal.",
        });
      }

      /*
       * Generate unique reference.
       */
      const reference =
        `WTH-${Date.now()}-${String(
          admin._id
        ).slice(-6)}`;

      /*
       * Current balances.
       */
      const balanceBefore =
        toNumber(
          wallet.availableBalance
        );

      const pendingBefore =
        toNumber(
          wallet.pendingBalance
        );

      /*
       * Check balance.
       */
      if (
        balanceBefore <
        amount
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Insufficient wallet balance.",
        });
      }

      /*
       * New balances.
       *
       * Money moves:
       *
       * available
       *      ↓
       * pending
       */
      const balanceAfter =
        balanceBefore -
        amount;

      const pendingAfter =
        pendingBefore +
        amount;

      /*
       * Update wallet atomically.
       */
      const updatedWallet =
        await Wallet.findOneAndUpdate(
          {
            _id:
              wallet._id,

            status:
              "ACTIVE",

            availableBalance: {
              $gte: amount,
            },
          },

          {
            $inc: {
              availableBalance:
                -amount,

              pendingBalance:
                amount,
            },

            $set: {
              lastTransactionAt:
                new Date(),
            },
          },

          {
            new: true,
          }
        );

      if (!updatedWallet) {
        return res.status(400).json({
          success: false,

          message:
            "Insufficient wallet balance or wallet is not active.",
        });
      }

      let withdrawal;

      try {
        /*
         * Create withdrawal.
         *
         * Your schema requires wallet.
         */
        withdrawal =
          await Withdrawal.create({
            wallet:
              wallet._id,

            owner:
              admin._id,

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

            metadata: {
              ownerType:
                "ADMIN",
            },
          });

        /*
         * Create PENDING ledger entry.
         */
        await Ledger.create({
          wallet:
            wallet._id,

          owner:
            admin._id,

          ownerType:
            "ADMIN",

          entryType:
            "WITHDRAWAL",

          direction:
            "DEBIT",

          amount,

          currency:
            wallet.currency ||
            "NGN",

          availableBalanceBefore:
            balanceBefore,

          availableBalanceAfter:
            balanceAfter,

          pendingBalanceBefore:
            pendingBefore,

          pendingBalanceAfter:
            pendingAfter,

          totalBalanceBefore:
            balanceBefore +
            pendingBefore,

          totalBalanceAfter:
            balanceAfter +
            pendingAfter,

          status:
            "PENDING",

          reference,

          idempotencyKey:
            `${reference}:WITHDRAWAL`,

          payment:
            null,

          relatedLedger:
            null,

          externalReference:
            null,

          description:
            `Withdrawal to ${bank.bankName} account`,

          metadata: {
            bankName:
              bank.bankName,

            accountName:
              bank.accountName,

            accountNumber:
              maskAccountNumber(
                bank.accountNumber
              ),
          },

          createdBy:
            admin._id,

          completedAt:
            null,
        });

      } catch (error) {
        /*
         * Roll wallet back.
         *
         * IMPORTANT:
         * Ledger is created after withdrawal.
         */
        await Wallet.updateOne(
          {
            _id:
              wallet._id,
          },

          {
            $inc: {
              availableBalance:
                amount,

              pendingBalance:
                -amount,
            },
          }
        );

        /*
         * Withdrawal can safely be removed
         * because it is NOT the immutable ledger.
         */
        if (
          withdrawal?._id
        ) {
          await Withdrawal.deleteOne(
            {
              _id:
                withdrawal._id,
            }
          );
        }

        throw error;
      }

      return res.status(201).json({
        success: true,

        message:
          "Withdrawal request submitted successfully.",

        withdrawal: {
          id: String(
            withdrawal._id
          ),

          amount:
            amount,

          bankName:
            bank.bankName,

          accountName:
            bank.accountName,

          accountNumber:
            maskAccountNumber(
              bank.accountNumber
            ),

          status:
            "Pending",

          requestedAt:
            withdrawal.requestedAt,

          processedAt:
            null,

          reference,
        },

        wallet: {
          balance:
            updatedWallet.availableBalance,

          pendingBalance:
            updatedWallet.pendingBalance,
        },
      });
    } catch (error) {
      console.error(
        "requestWithdrawal error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to request withdrawal.",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined,
      });
    }
  };

