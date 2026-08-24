import mongoose from "mongoose";
import Wallet from "../model/Wallet.js";
import Ledger from "../model/Ledger.js";

export const getWalletDashboard = async (userId) => {

    const wallet = await Wallet.findOne({
        owner: userId,
        ownerType: "USER"
    });

    if (!wallet) {
        throw new Error("Wallet not found");
    }

    const summary = await Ledger.aggregate([

        {
            $match: {
                wallet: wallet._id,
                status: "COMPLETED"
            }
        },

        {
            $group: {

                _id: null,

                totalCredit: {
                    $sum: {
                        $cond: [
                            { $eq: ["$type", "CREDIT"] },
                            "$amount",
                            0
                        ]
                    }
                },

                totalWithdrawal: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$type", "DEBIT"] },
                                    { $eq: ["$category", "PAYOUT_REQUEST"] }
                                ]
                            },
                            "$amount",
                            0
                        ]
                    }
                },

                totalEscrow: {
                    $sum: {
                        $cond: [
                            {
                                $eq: [
                                    "$category",
                                    "ESCROW_RELEASE"
                                ]
                            },
                            "$amount",
                            0
                        ]
                    }
                },

                totalRefund: {
                    $sum: {
                        $cond: [
                            {
                                $eq: [
                                    "$category",
                                    "ESCROW_REFUND"
                                ]
                            },
                            "$amount",
                            0
                        ]
                    }
                }

            }
        }

    ]);

    const transactions = await Ledger.find({
        wallet: wallet._id
    })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("payment")
        .populate("order")
        .populate("refund");

    return {

        wallet,

        summary: summary[0] || {
            totalCredit: 0,
            totalWithdrawal: 0,
            totalEscrow: 0,
            totalRefund: 0
        },

        transactions

    };

};