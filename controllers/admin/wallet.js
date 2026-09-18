
import Usercbt from "../../model/Users.js";
import Othercbt from "../../model/Others.js";
import WalletTransaction from "../../model/Ledger.js";
import Withdrawal from "../../model/withdrawal.js";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const roundMoney = (value) => {
  return Math.round(
    Number(value) * 100
  ) / 100;
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

/*
|--------------------------------------------------------------------------
| Get wallet dashboard
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet
|
*/

export const getWalletDashboard =
  async (req, res) => {
    try {
      const adminId = req.user?._id;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated.",
        });
      }

      const admin =
        await Usercbt.findOne({
          _id: adminId,
          role: "admin",
        }).select(
          "firstName middleName lastName email walletBalance commissionPercentage"
        );

      if (!admin) {
        return res.status(403).json({
          success: false,
          message:
            "Admin account not found.",
        });
      }

      /*
       * Commission total
       */
      const commissionResult =
        await WalletTransaction.aggregate([
          {
            $match: {
              owner: adminId,
              type: "Commission",
              direction: "Credit",
              status: "Completed",
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
       * All completed credits
       */
      const creditResult =
        await WalletTransaction.aggregate([
          {
            $match: {
              owner: adminId,
              direction: "Credit",
              status: "Completed",
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
       * All completed debits
       */
      const debitResult =
        await WalletTransaction.aggregate([
          {
            $match: {
              owner: adminId,
              direction: "Debit",
              status: "Completed",
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
       * Completed withdrawals
       */
      const completedWithdrawalResult =
        await Withdrawal.aggregate([
          {
            $match: {
              owner: adminId,
              status: "Completed",
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
       * Pending + processing withdrawals
       */
      const pendingWithdrawalResult =
        await Withdrawal.aggregate([
          {
            $match: {
              owner: adminId,
              status: {
                $in: [
                  "Pending",
                  "Processing",
                ],
              },
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
       * Recent transactions
       */
      const transactions =
        await WalletTransaction.find({
          owner: adminId,
        })
          .sort({
            createdAt: -1,
          })
          .limit(50)
          .lean();

      /*
       * Recent withdrawals
       */
      const withdrawals =
        await Withdrawal.find({
          owner: adminId,
        })
          .sort({
            createdAt: -1,
          })
          .limit(20)
          .lean();

      const totalCommission =
        commissionResult[0]?.total || 0;

      const totalCredits =
        creditResult[0]?.total || 0;

      const totalDebits =
        debitResult[0]?.total || 0;

      const totalWithdrawn =
        completedWithdrawalResult[0]
          ?.total || 0;

      const pendingWithdrawal =
        pendingWithdrawalResult[0]
          ?.total || 0;

      return res.json({
        success: true,

        wallet: {
          balance:
            roundMoney(
              admin.walletBalance || 0
            ),

          totalEarned:
            roundMoney(
              totalCommission
            ),

          totalWithdrawn:
            roundMoney(
              totalWithdrawn
            ),

          pendingWithdrawal:
            roundMoney(
              pendingWithdrawal
            ),

          commissionRate:
            Number(
              admin.commissionPercentage ||
                0
            ),

          totalCredits:
            roundMoney(
              totalCredits
            ),

          totalDebits:
            roundMoney(
              totalDebits
            ),
        },

        admin: {
          _id: admin._id,
          name: buildName(admin),
          email: admin.email,
        },

        transactions,

        withdrawals,

        minimumWithdrawal: 5000,
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
| Get transactions
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet/transactions
|
*/

export const getWalletTransactions =
  async (req, res) => {
    try {
      const adminId = req.user?._id;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message:
            "User not authenticated.",
        });
      }

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
        owner: adminId,
      };

      if (type && type !== "All Types") {
        query.type = type;
      }

      if (
        status &&
        status !== "All Status"
      ) {
        query.status = status;
      }

      if (search?.trim()) {
        const regex =
          new RegExp(
            search.trim(),
            "i"
          );

        query.$or = [
          {
            description: regex,
          },
          {
            source: regex,
          },
          {
            reference: regex,
          },
        ];
      }

      const skip =
        (page - 1) * limit;

      const [
        transactions,
        total,
      ] = await Promise.all([
        WalletTransaction.find(query)
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        WalletTransaction.countDocuments(
          query
        ),
      ]);

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
      });
    }
  };

/*
|--------------------------------------------------------------------------
| Get withdrawals
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet/withdrawals
|
*/

export const getWalletWithdrawals =
  async (req, res) => {
    try {
      const adminId = req.user?._id;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message:
            "User not authenticated.",
        });
      }

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
        owner: adminId,
      };

      if (
        status &&
        status !== "All Status"
      ) {
        query.status = status;
      }

      if (search?.trim()) {
        const regex =
          new RegExp(
            search.trim(),
            "i"
          );

        query.$or = [
          {
            reference: regex,
          },
          {
            bankName: regex,
          },
          {
            accountName: regex,
          },
        ];
      }

      const skip =
        (page - 1) * limit;

      const [
        withdrawals,
        total,
      ] = await Promise.all([
        Withdrawal.find(query)
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

          withdrawals.map(
            (withdrawal) => ({
              ...withdrawal,

              accountNumber:
                withdrawal.accountNumberMasked,
            })
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
| Get one withdrawal
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet/withdrawals/:withdrawalId
|
*/

export const getWithdrawal =
  async (req, res) => {
    try {
      const adminId = req.user?._id;

      const withdrawal =
        await Withdrawal.findOne({
          _id:
            req.params.withdrawalId,
          owner: adminId,
        })
          .select(
            "+accountNumber"
          )
          .lean();

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
          ...withdrawal,

          accountNumber:
            withdrawal.accountNumberMasked,
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
| Request withdrawal
|--------------------------------------------------------------------------
|
| POST /api/admin/wallet/withdrawals
|
| Body:
| {
|   "amount": 5000
| }
|
*/

export const requestWithdrawal =
  async (req, res) => {
    try {
      const adminId = req.user?._id;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message:
            "User not authenticated.",
        });
      }

      const amount =
        roundMoney(
          Number(req.body?.amount)
        );

      const MINIMUM_WITHDRAWAL =
        5000;

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid withdrawal amount.",
        });
      }

      if (
        amount <
        MINIMUM_WITHDRAWAL
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Minimum withdrawal is ₦${MINIMUM_WITHDRAWAL.toLocaleString(
              "en-NG"
            )}.`,
        });
      }

      /*
       * Load admin
       */
      const admin =
        await Usercbt.findOne({
          _id: adminId,
          role: "admin",
        }).select(
          "firstName middleName lastName walletBalance"
        );

      if (!admin) {
        return res.status(403).json({
          success: false,
          message:
            "Admin account not found.",
        });
      }

      /*
       * Load CBT admin bank details.
       *
       * accountNumber is select:false,
       * so explicitly select it.
       */
      const profile =
        await Othercbt.findOne({
          user: adminId,
        })
          .select(
            "+bank.accountNumber"
          )
          .lean();

      const bank =
        profile?.bank || {};

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

      /*
       * Recommended:
       * require bank verification.
       *
       * Remove this block if your bank
       * verification process is not active yet.
       */
      if (
        bank.verified !== true
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Your bank account must be verified before withdrawal.",
        });
      }

      /*
       * Atomically reserve/debit wallet.
       *
       * This prevents two simultaneous requests
       * from spending the same balance.
       */
      const updatedAdmin =
        await Usercbt.findOneAndUpdate(
          {
            _id: adminId,
            role: "admin",

            walletBalance: {
              $gte: amount,
            },
          },
          {
            $inc: {
              walletBalance:
                -amount,
            },
          },
          {
            new: true,
          }
        ).select(
          "walletBalance"
        );

      if (!updatedAdmin) {
        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance.",
        });
      }

      const reference =
        `WTH-${Date.now()}-${String(
          adminId
        ).slice(-6)}`;

      let withdrawal;

      try {
        withdrawal =
          await Withdrawal.create({
            owner: adminId,

            amount,

            bankName:
              bank.bankName,

            bankCode:
              bank.bankCode || "",

            accountName:
              bank.accountName,

            accountNumber:
              bank.accountNumber,

            accountNumberMasked:
              maskAccountNumber(
                bank.accountNumber
              ),

            status: "Pending",

            requestedAt:
              new Date(),

            reference,
          });

        /*
         * Create wallet ledger entry.
         */
        await WalletTransaction.create(
          {
            owner: adminId,

            type: "Withdrawal",

            description:
              `Withdrawal to ${bank.bankName} account`,

            source:
              bank.bankName,

            amount,

            direction: "Debit",

            status: "Pending",

            reference,

            withdrawal:
              withdrawal._id,
          }
        );
      } catch (error) {
        /*
         * Roll wallet balance back
         * if creating the withdrawal/ledger fails.
         */
        await Usercbt.updateOne(
          {
            _id: adminId,
          },
          {
            $inc: {
              walletBalance:
                amount,
            },
          }
        );

        /*
         * Clean partially-created records.
         */
        if (withdrawal?._id) {
          await Withdrawal.deleteOne(
            {
              _id: withdrawal._id,
            }
          );
        }

        await WalletTransaction.deleteOne(
          {
            reference,
          }
        );

        throw error;
      }

      return res.status(201).json({
        success: true,

        message:
          "Withdrawal request submitted successfully.",

        withdrawal: {
          _id:
            withdrawal._id,

          amount:
            withdrawal.amount,

          bankName:
            withdrawal.bankName,

          accountName:
            withdrawal.accountName,

          accountNumber:
            withdrawal.accountNumberMasked,

          status:
            withdrawal.status,

          requestedAt:
            withdrawal.requestedAt,

          processedAt:
            withdrawal.processedAt,

          reference:
            withdrawal.reference,
        },

        wallet: {
          balance:
            updatedAdmin.walletBalance,
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