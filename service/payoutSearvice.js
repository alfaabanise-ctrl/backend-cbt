import mongoose from "mongoose";
import Wallet from "../model/Wallet.js";
import BankAccount from "../model/BankAccount.js";
import Payout from "../model/Payout.js";
import WalletService from "./WalletService.js";

export const createPayout = async (userId, amountInNaira) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const amount = Math.round(Number(amountInNaira) * 100);

        if (!amount || amount <= 0) {
            throw new Error("Invalid withdrawal amount.");
        }

        // Check wallet
     
      

        if (wallet.balance < amount) {
            throw new Error("Insufficient wallet balance.");
        }

        // Check bank account
        const bank = await BankAccount.findOne({
            user: userId,
        }).session(session);

        if (!bank) {
            throw new Error("Please set up your bank account.");
        }

        if (bank.status !== "APPROVED") {
            throw new Error(
                "Your bank account must be approved before requesting a withdrawal."
            );
        }

        const reference = `PAYOUT_${Date.now()}${Math.floor(
            Math.random() * 10000
        )}`;

        // Create payout
        const payout = await Payout.create(
            [
                {
                    user: userId,
                    wallet: wallet._id,
                    bankAccount: bank._id,
                    amount,
                    fee: 0,
                    netAmount: amount,
                    reference,
                    status: "PENDING",
                },
            ],
            { session }
        );

        // Debit wallet & create ledger
        await WalletService.debitUserWallet({
            userId,
            amount,
            category: "WITHDRAWAL",
            reference,
            description: "Withdrawal request submitted.",
            metadata: {
                payoutId: payout[0]._id,
                bankAccount: bank.accountNumber,
                bankName: bank.bankName,
            },
            session,
        });

        await session.commitTransaction();

        return payout[0];
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
};

