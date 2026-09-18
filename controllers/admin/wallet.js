import mongoose from "mongoose";

import Wallet from "../../model/Wallet.js";
import Ledger from "../../model/Ledger.js";
import Withdrawal from "../../model/Withdrawal.js";
import Usertp from "../../model/Users.js";

/*
|--------------------------------------------------------------------------
| GENERAL WALLET CONTROLLER
|--------------------------------------------------------------------------
|
| One wallet API for authenticated users.
|
| Current supported wallet roles:
|
|   admin   -> ADMIN
|   teacher -> TEACHER
|   student -> STUDENT
|
| NOTE:
| Your Wallet schema must contain STUDENT in ownerType if
| students are also going to have wallets.
|
|--------------------------------------------------------------------------
*/

const MINIMUM_WITHDRAWAL_KOBO = 500000;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

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

const escapeRegex = (value) => {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/*
|--------------------------------------------------------------------------
| ROLE -> WALLET OWNER TYPE
|--------------------------------------------------------------------------
*/

const getOwnerType = (role) => {
  switch (role) {
    case "admin":
      return "ADMIN";

    case "teacher":
      return "TEACHER";

    case "student":
      return "STUDENT";

    default:
      return null;
  }
};

/*
|--------------------------------------------------------------------------
| GET CURRENT USER
|--------------------------------------------------------------------------
*/

const getWalletUser = async (
  userId
) => {
  if (!userId) {
    return null;
  }

  return await Usertp.findById(
    userId
  )
    .select(
      "_id firstName middleName lastName email phone whatsapp_no avatar role status commissionPercentage adminOwner teacherOwner createdAt"
    )
    .lean();
};

/*
|--------------------------------------------------------------------------
| GET OR CREATE WALLET
|--------------------------------------------------------------------------
*/

const getOrCreateWallet = async (
  ownerId,
  ownerType
) => {
  let wallet =
    await Wallet.findOne({
      owner: ownerId,
      ownerType,
    });

  if (wallet) {
    return wallet;
  }

  try {
    return await Wallet.create({
      owner: ownerId,

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

      lastTransactionAt:
        null,

      lastWithdrawalAt:
        null,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existingWallet =
        await Wallet.findOne({
          owner: ownerId,
          ownerType,
        });

      if (existingWallet) {
        return existingWallet;
      }
    }

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| FORMAT TRANSACTION
|--------------------------------------------------------------------------
*/

const formatTransaction = (
  entry
) => {
  let type = "Adjustment";

  switch (
    entry.entryType
  ) {
    case "COMMISSION":
      type = "Commission";
      break;

    case "WITHDRAWAL":
    case "PAYOUT":
      type = "Withdrawal";
      break;

    case "REFUND":
    case "REVERSAL":
      type = "Refund";
      break;

    default:
      type = "Adjustment";
  }

  let status = "Pending";

  switch (
    entry.status
  ) {
    case "COMPLETED":
      status = "Completed";
      break;

    case "PENDING":
    case "PROCESSING":
      status = "Pending";
      break;

    case "FAILED":
    case "CANCELLED":
    case "REVERSED":
      status = "Failed";
      break;
  }

  return {
    id: String(
      entry._id
    ),

    type,

    description:
      entry.description ||
      entry.entryType,

    source:
      entry.metadata?.studentName ||
      entry.metadata?.source ||
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

    status,

    date:
      entry.createdAt,

    reference:
      entry.reference,
  };
};

/*
|--------------------------------------------------------------------------
| FORMAT WITHDRAWAL
|--------------------------------------------------------------------------
*/

const formatWithdrawal = (
  item
) => {
  return {
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

    rejectionReason:
      item.rejectionReason ||
      "",
  };
};

/*
|--------------------------------------------------------------------------
| GET WALLET DASHBOARD
|--------------------------------------------------------------------------
|
| GET /api/wallet
|--------------------------------------------------------------------------
*/

export const getWalletDashboard =
  async (req, res) => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "User session not found.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | GET USER
      |--------------------------------------------------------------------------
      */

      const user =
        await getWalletUser(
          userId
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User account not found.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | OWNER TYPE
      |--------------------------------------------------------------------------
      */

      const ownerType =
        getOwnerType(
          user.role
        );

      if (!ownerType) {
        return res.status(403).json({
          success: false,
          message:
            "Wallet is not available for this user role.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | WALLET
      |--------------------------------------------------------------------------
      */

      const wallet =
        await getOrCreateWallet(
          user._id,
          ownerType
        );

      const walletId =
        new mongoose.Types.ObjectId(
          wallet._id
        );

      /*
      |--------------------------------------------------------------------------
      | LEDGER SUMMARY
      |--------------------------------------------------------------------------
      */

      const ledgerSummary =
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
      | PENDING COMMISSION
      |--------------------------------------------------------------------------
      */

      const pendingCommissionResult =
        await Ledger.aggregate([
          {
            $match: {
              wallet:
                walletId,

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
                $sum:
                  "$amount",
              },
            },
          },
        ]);

      /*
      |--------------------------------------------------------------------------
      | WITHDRAWAL SUMMARY
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
      | RECENT TRANSACTIONS
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
      | RECENT WITHDRAWALS
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

      const ledger =
        ledgerSummary[0] ||
        {};

      const withdrawal =
        withdrawalSummary[0] ||
        {};

      /*
      |--------------------------------------------------------------------------
      | RESPONSE
      |--------------------------------------------------------------------------
      */

      return res.json({
        success: true,

        user: {
          id:
            user._id,

          name:
            buildName(user),

          email:
            user.email,

          phone:
            user.phone,

          avatar:
            user.avatar,

          role:
            user.role,
        },

        wallet: {
          id:
            wallet._id,

          owner:
            wallet.owner,

          ownerType:
            wallet.ownerType,

          balance:
            toNumber(
              wallet.availableBalance
            ),

          availableBalance:
            toNumber(
              wallet.availableBalance
            ),

          pendingBalance:
            toNumber(
              wallet.pendingBalance
            ),

          totalEarned:
            toNumber(
              ledger.totalCommission
            ),

          totalWithdrawn:
            toNumber(
              withdrawal.completed
            ),

          pendingWithdrawal:
            toNumber(
              withdrawal.pending
            ),

          totalRefunded:
            toNumber(
              wallet.totalRefunded
            ),

          totalCredits:
            toNumber(
              ledger.totalCredits
            ),

          totalDebits:
            toNumber(
              ledger.totalDebits
            ),

          commissionRate:
            toNumber(
              user.commissionPercentage
            ),

          pendingCommission:
            toNumber(
              pendingCommissionResult[0]
                ?.total
            ),

          status:
            wallet.status,
        },

        transactions:
          ledgerRows.map(
            formatTransaction
          ),

        withdrawals:
          withdrawalRows.map(
            formatWithdrawal
          ),

        minimumWithdrawal:
          MINIMUM_WITHDRAWAL_KOBO,

        permissions: {
          canHaveWallet:
            true,

          canReceiveCommission:
            [
              "admin",
              "teacher",
            ].includes(
              user.role
            ),

          canWithdraw:
            [
              "admin",
              "teacher",
            ].includes(
              user.role
            ) &&
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
| GET TRANSACTIONS
|--------------------------------------------------------------------------
|
| GET /api/wallet/transactions
|--------------------------------------------------------------------------
*/

export const getWalletTransactions =
  async (req, res) => {
    try {
      const user =
        await getWalletUser(
          req.user?._id
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User account not found.",
        });
      }

      const ownerType =
        getOwnerType(
          user.role
        );

      if (!ownerType) {
        return res.status(403).json({
          success: false,
          message:
            "Wallet is not available for this role.",
        });
      }

      const wallet =
        await getOrCreateWallet(
          user._id,
          ownerType
        );

      let page =
        Math.max(
          Number(
            req.query.page
          ) || 1,
          1
        );

      let limit =
        Math.min(
          Math.max(
            Number(
              req.query.limit
            ) || 20,
            1
          ),
          100
        );

      const query = {
        wallet:
          wallet._id,
      };

      /*
      |--------------------------------------------------------------------------
      | TYPE
      |--------------------------------------------------------------------------
      */

      const type =
        req.query.type;

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
        type &&
        type !== "All Types" &&
        typeMap[type]
      ) {
        query.entryType =
          typeMap[type];
      }

      /*
      |--------------------------------------------------------------------------
      | STATUS
      |--------------------------------------------------------------------------
      */

      const status =
        req.query.status;

      const statusMap = {
        Completed:
          "COMPLETED",

        Pending:
          "PENDING",

        Failed:
          "FAILED",
      };

      if (
        status &&
        status !== "All Status" &&
        statusMap[status]
      ) {
        query.status =
          statusMap[status];
      }

      /*
      |--------------------------------------------------------------------------
      | SEARCH
      |--------------------------------------------------------------------------
      */

      const search =
        String(
          req.query.search ||
            ""
        ).trim();

      if (search) {
        const regex =
          new RegExp(
            escapeRegex(
              search
            ),
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
      ] =
        await Promise.all([
          Ledger.find(
            query
          )
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

      return res.json({
        success: true,

        transactions:
          rows.map(
            formatTransaction
          ),

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
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET WITHDRAWALS
|--------------------------------------------------------------------------
|
| GET /api/wallet/withdrawals
|--------------------------------------------------------------------------
*/

export const getWalletWithdrawals =
  async (req, res) => {
    try {
      const user =
        await getWalletUser(
          req.user?._id
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User account not found.",
        });
      }

      const ownerType =
        getOwnerType(
          user.role
        );

      if (!ownerType) {
        return res.status(403).json({
          success: false,
          message:
            "Wallet is not available for this role.",
        });
      }

      const wallet =
        await getOrCreateWallet(
          user._id,
          ownerType
        );

      let page =
        Math.max(
          Number(
            req.query.page
          ) || 1,
          1
        );

      let limit =
        Math.min(
          Math.max(
            Number(
              req.query.limit
            ) || 20,
            1
          ),
          100
        );

      const query = {
        wallet:
          wallet._id,

        owner:
          user._id,
      };

      /*
      |--------------------------------------------------------------------------
      | STATUS
      |--------------------------------------------------------------------------
      */

      const status =
        req.query.status;

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
      |--------------------------------------------------------------------------
      | SEARCH
      |--------------------------------------------------------------------------
      */

      const search =
        String(
          req.query.search ||
            ""
        ).trim();

      if (search) {
        const regex =
          new RegExp(
            escapeRegex(
              search
            ),
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
      ] =
        await Promise.all([
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

      return res.json({
        success: true,

        withdrawals:
          rows.map(
            formatWithdrawal
          ),

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
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET ONE WITHDRAWAL
|--------------------------------------------------------------------------
|
| GET /api/wallet/withdrawals/:withdrawalId
|--------------------------------------------------------------------------
*/

export const getWithdrawal =
  async (req, res) => {
    try {
      const {
        withdrawalId,
      } = req.params;

      if (
        !mongoose.isValidObjectId(
          withdrawalId
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid withdrawal ID.",
        });
      }

      const user =
        await getWalletUser(
          req.user?._id
        );

      if (!user) {
        return res.status(404).json({
          success: false,

          message:
            "User account not found.",
        });
      }

      const ownerType =
        getOwnerType(
          user.role
        );

      if (!ownerType) {
        return res.status(403).json({
          success: false,

          message:
            "Wallet is not available for this role.",
        });
      }

      const wallet =
        await getOrCreateWallet(
          user._id,
          ownerType
        );

      const withdrawal =
        await Withdrawal.findOne({
          _id:
            withdrawalId,

          wallet:
            wallet._id,

          owner:
            user._id,
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

        withdrawal:
          formatWithdrawal(
            withdrawal
          ),
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
| POST /api/wallet/withdraw
|
| Body:
|
| {
|   amount: 500000
| }
|
| 500000 Kobo = ₦5,000
|--------------------------------------------------------------------------
*/

export const requestWithdrawal =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      const user =
        await getWalletUser(
          req.user?._id
        );

      if (!user) {
        return res.status(404).json({
          success: false,

          message:
            "User account not found.",
        });
      }

      const ownerType =
        getOwnerType(
          user.role
        );

      if (!ownerType) {
        return res.status(403).json({
          success: false,

          message:
            "Wallet is not available for this user.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Withdrawal permission
      |--------------------------------------------------------------------------
      |
      | Current business rule:
      | admin and teacher may withdraw.
      |
      |--------------------------------------------------------------------------
      */

      if (
        ![
          "admin",
          "teacher",
        ].includes(
          user.role
        )
      ) {
        return res.status(403).json({
          success: false,

          message:
            "This account is not allowed to request withdrawals.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | AMOUNT
      |--------------------------------------------------------------------------
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
      |--------------------------------------------------------------------------
      | MINIMUM
      |--------------------------------------------------------------------------
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

      let result = null;

      /*
      |--------------------------------------------------------------------------
      | TRANSACTION
      |--------------------------------------------------------------------------
      */

      await session.withTransaction(
        async () => {
          /*
          |--------------------------------------------------------------------------
          | GET WALLET
          |--------------------------------------------------------------------------
          */

          const wallet =
            await Wallet.findOne({
              owner:
                user._id,

              ownerType,

              status:
                "ACTIVE",
            }).session(
              session
            );

          if (!wallet) {
            throw new Error(
              "Wallet not found."
            );
          }

          /*
          |--------------------------------------------------------------------------
          | BANK DETAILS
          |--------------------------------------------------------------------------
          */

          const bank =
            wallet.bankDetails ||
            {};

          if (
            !bank.bankName ||
            !bank.accountName ||
            !bank.accountNumber
          ) {
            throw new Error(
              "Please complete your bank details before requesting a withdrawal."
            );
          }

          if (
            bank.verified !==
            true
          ) {
            throw new Error(
              "Your bank account must be verified before withdrawal."
            );
          }

          /*
          |--------------------------------------------------------------------------
          | BALANCE
          |--------------------------------------------------------------------------
          */

          const availableBefore =
            toNumber(
              wallet.availableBalance
            );

          const pendingBefore =
            toNumber(
              wallet.pendingBalance
            );

          if (
            availableBefore <
            amount
          ) {
            throw new Error(
              "Insufficient wallet balance."
            );
          }

          /*
          |--------------------------------------------------------------------------
          | NEW BALANCE
          |--------------------------------------------------------------------------
          */

          const availableAfter =
            availableBefore -
            amount;

          const pendingAfter =
            pendingBefore +
            amount;

          const totalBefore =
            availableBefore +
            pendingBefore;

          const totalAfter =
            availableAfter +
            pendingAfter;

          /*
          |--------------------------------------------------------------------------
          | REFERENCE
          |--------------------------------------------------------------------------
          */

          const reference =
            `WTH-${Date.now()}-${String(
              user._id
            ).slice(-6)}-${Math.random()
              .toString(36)
              .slice(2, 7)
              .toUpperCase()}`;

          /*
          |--------------------------------------------------------------------------
          | WITHDRAWAL
          |--------------------------------------------------------------------------
          */

          const withdrawalResult =
            await Withdrawal.create(
              [
                {
                  wallet:
                    wallet._id,

                  owner:
                    user._id,

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

                  processedAt:
                    null,

                  reference,

                  rejectionReason:
                    "",

                  metadata: {
                    ownerType,

                    ownerRole:
                      user.role,

                    currency:
                      wallet.currency ||
                      "NGN",

                    amountKobo:
                      amount,

                    amountNaira:
                      amount / 100,
                  },
                },
              ],
              {
                session,
              }
            );

          const withdrawal =
            withdrawalResult[0];

          /*
          |--------------------------------------------------------------------------
          | LEDGER
          |--------------------------------------------------------------------------
          */

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
                  wallet.currency ||
                  "NGN",

                availableBalanceBefore:
                  availableBefore,

                availableBalanceAfter:
                  availableAfter,

                pendingBalanceBefore:
                  pendingBefore,

                pendingBalanceAfter:
                  pendingAfter,

                totalBalanceBefore:
                  totalBefore,

                totalBalanceAfter:
                  totalAfter,

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
                  withdrawalId:
                    withdrawal._id,

                  ownerType,

                  ownerRole:
                    user.role,

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
                  user._id,

                completedAt:
                  null,

                reversedAt:
                  null,
              },
            ],
            {
              session,
            }
          );

          /*
          |--------------------------------------------------------------------------
          | UPDATE WALLET
          |--------------------------------------------------------------------------
          */

          wallet.availableBalance =
            availableAfter;

          wallet.pendingBalance =
            pendingAfter;

          wallet.lastTransactionAt =
            new Date();

          await wallet.save({
            session,
          });

          result = {
            wallet,

            withdrawal,
          };
        }
      );

      /*
      |--------------------------------------------------------------------------
      | RESPONSE
      |--------------------------------------------------------------------------
      */

      return res.status(201).json({
        success: true,

        message:
          "Withdrawal request submitted successfully.",

        withdrawal:
          formatWithdrawal(
            result.withdrawal
          ),

        wallet: {
          id:
            result.wallet._id,

          owner:
            result.wallet.owner,

          ownerType:
            result.wallet.ownerType,

          balance:
            toNumber(
              result.wallet
                .availableBalance
            ),

          availableBalance:
            toNumber(
              result.wallet
                .availableBalance
            ),

          pendingBalance:
            toNumber(
              result.wallet
                .pendingBalance
            ),

          currency:
            result.wallet.currency ||
            "NGN",
        },
      });
    } catch (error) {
      console.error(
        "requestWithdrawal error:",
        error
      );

      return res.status(400).json({
        success: false,

        message:
          error?.message ||
          "Failed to request withdrawal.",
      });
    } finally {
      await session.endSession();
    }
  };