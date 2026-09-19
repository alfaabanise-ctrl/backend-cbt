import mongoose from "mongoose";
import WalletService from "../service/wallet.service.js";


// ============================================================
// USER REQUEST WITHDRAWAL
// ============================================================

export const requestWithdrawal =
  async (req, res, next) => {
    const session =
      await mongoose.startSession();

    try {
      /*
       * IMPORTANT:
       *
       * Frontend already converts:
       *
       * ₦10,000
       * ↓
       * 1,000,000 kobo
       *
       * So DO NOT multiply by 100 here.
       */
      const amount =
        Number(req.body.amount);

      if (
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid withdrawal amount",
        });
      }

      if (amount < 200000) {
        return res.status(400).json({
          success: false,
          message:
            "Minimum withdrawal is ₦5,000",
        });
      }

      let result;

      await session.withTransaction(
        async () => {
          result =
            await WalletService
              .requestWithdrawal({
                userId: req.user._id,

                amount,

                metadata: {
                  ipAddress:
                    req.ip,

                  userAgent:
                    req.headers[
                      "user-agent"
                    ],
                },

                session,
              });
        }
      );

      return res.status(201).json({
        success: true,

        message:
          "Withdrawal request submitted successfully",

        data: {
          withdrawal:
            result.withdrawal,

          wallet:
            result.wallet,

          ledger:
            result.ledger,
        },
      });
    } catch (error) {
      next(error);
    } finally {
      await session.endSession();
    }
  };


// ============================================================
// SUPER ADMIN APPROVE
// ============================================================

export const approveWithdrawal =
  async (req, res, next) => {
    try {
      const result =
        await WalletService
          .approveWithdrawal({
            withdrawalId:
              req.params.withdrawalId,

            superAdminId:
              req.user._id,

            metadata: {
              ipAddress:
                req.ip,

              userAgent:
                req.headers[
                  "user-agent"
                ],
            },
          });

      return res.json({
        success: true,

        message:
          "Withdrawal approved successfully",

        data: result,
      });
    } catch (error) {
      next(error);
    }
  };


// ============================================================
// SUPER ADMIN REJECT
// ============================================================

export const rejectWithdrawal =
  async (req, res, next) => {
    try {
      const rejectionReason =
        String(
          req.body.rejectionReason || ""
        ).trim();

      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message:
            "Rejection reason is required",
        });
      }

      const result =
        await WalletService
          .rejectWithdrawal({
            withdrawalId:
              req.params.withdrawalId,

            superAdminId:
              req.user._id,

            rejectionReason,

            metadata: {
              ipAddress:
                req.ip,

              userAgent:
                req.headers[
                  "user-agent"
                ],
            },
          });

      return res.json({
        success: true,

        message:
          "Withdrawal rejected successfully",

        data: result,
      });
    } catch (error) {
      next(error);
    }
  };