import Wallet from "../model/Wallet.js";
import Ledger from "../model/Ledger.js";
import Usertp from '../model/Users.js'


// // await WalletService.creditUserWallet({
// //     userId: user._id,
// //     payment,
// //     amount: 50000,
// //     category: "WALLET_FUNDING",
// //     reference: payment.txRef,
// //     description: "Wallet funded via Paystack",
// //     session
// // });

// // await WalletService.creditUserWallet({
// //     userId: buyer._id,
// //     refund,
// //     amount: refund.amount,
// //     category: "ESCROW_REFUND",
// //     reference: refund.reference,
// //     description: "Refund for cancelled order",
// //     session
// // });

// // await WalletService.debitUserWallet({
// //     userId: buyer._id,
// //     order,
// //     amount: order.totalAmount,
// //     category: "PROPERTY_PAYMENT",
// //     reference: order.orderNumber,
// //     description: "Property payment",
// //     session
// // });
// class WalletService {

//     /**
//      * Credit Platform Wallet
//      */
//     static async creditPlatformWallet({
//         payment,
//         order,
//         amount,
//         transaction,
//         session
//     }) {

//         /*------------------------------------
//         Find Platform Wallet
//         ------------------------------------*/
//         const wallet = await Wallet.findOne({
//             ownerType: "PLATFORM",
//             status: "ACTIVE"
//         }).session(session);

//         if (!wallet) {
//             throw new Error("Platform wallet not found.");
//         }

//         /*------------------------------------
//         Credit Wallet
//         ------------------------------------*/
//         const balanceBefore = wallet.balance;

//         wallet.credit(amount);

//         await wallet.save({ session });

//         /*------------------------------------
//         Create Ledger
//         ------------------------------------*/
//         await Ledger.create(
//             [{
//                 wallet: wallet._id,

//                 payment: payment._id,

//                 order: order._id,

//                 type: "CREDIT",

//                 category: "ESCROW_DEPOSIT",

//                 amount,

//                 currency: payment.currency,

//                 balanceBefore,

//                 balanceAfter: wallet.balance,

//                 reference: payment.txRef,

//                 description: `Escrow funding for Order ${order._id}`,

//                 status: "COMPLETED",

//                 metadata: {
//                     gateway: "PAYSTACK",
//                     transactionId: transaction.id,
//                     paidAmount: transaction.amount,
//                     gatewayFee: transaction.fees,
//                     channel: transaction.channel,
//                     customerEmail: transaction.customer?.email
//                 }
//             }],
//             { session }
//         );

//         return wallet;
//     }

//     /**
//  * Debit Platform Wallet
//  */
//     static async debitPlatformWallet({
//         payment = null,
//         order = null,
//         refund = null,
//         amount,
//         category,
//         reference,
//         description,
//         metadata = {},
//         session
//     }) {

//         /*------------------------------------
//         Find Platform Wallet
//         ------------------------------------*/
//         const wallet = await Wallet.findOne({
//             ownerType: "PLATFORM",
//             status: "ACTIVE"
//         }).session(session);

//         if (!wallet) {
//             throw new Error("Platform wallet not found.");
//         }

//         if (wallet.balance < amount) {
//             throw new Error("Insufficient platform wallet balance.");
//         }

//         /*------------------------------------
//         Debit Wallet
//         ------------------------------------*/
//         const balanceBefore = wallet.balance;

//         wallet.debit(amount);

//         await wallet.save({ session });

//         /*------------------------------------
//         Create Ledger
//         ------------------------------------*/
//         await Ledger.create(
//             [{
//                 wallet: wallet._id,

//                 payment: payment?._id || null,

//                 order: order?._id || null,

//                 refund: refund?._id || null,

//                 type: "DEBIT",

//                 category,

//                 amount,

//                 currency: wallet.currency,

//                 balanceBefore,

//                 balanceAfter: wallet.balance,

//                 reference,

//                 description,

//                 status: "COMPLETED",

//                 metadata
//             }],
//             { session }
//         );

//         return wallet;
//     }


//     /**
//      * Credit User Wallet
//      */
//     static async creditUserWallet({
//         userId,
//         payment = null,
//         order = null,
//         refund = null,
//         amount,
//         category,
//         reference,
//         description,
//         metadata = {},
//         session
//     }) {

//         let wallet = await Wallet.findOne({
//             owner: userId,
//             ownerType: "USER",
//             status: "ACTIVE"
//         }).session(session);

//         if (!wallet) {

//             const user = await Usertp.findById(userId).session(session);

//             if (!user) {
//                 throw new Error("User not found.");
//             }

//             wallet = await Wallet.create([{
//                 owner: user._id,
//                 ownerType: "USER",
//                 currency: "NGN",
//                 balance: 0,
//                 status: "ACTIVE"
//             }], { session });

//             wallet = wallet[0]; // create() with session returns an array
//         }

//         const balanceBefore = wallet.balance;

//         wallet.credit(amount);

//         await wallet.save({ session });

//         await Ledger.create([{
//             wallet: wallet._id,

//             payment: payment?._id || null,

//             order: order?._id || null,

//             refund: refund?._id || null,

//             type: "CREDIT",

//             category,

//             amount,

//             currency: wallet.currency,

//             balanceBefore,

//             balanceAfter: wallet.balance,

//             reference,

//             description,

//             status: "COMPLETED",

//             metadata
//         }], { session });

//         return wallet;
//     }

//     /**
//      * Debit User Wallet
//      */
//     static async debitUserWallet({
//         userId,
//         payment = null,
//         order = null,
//         refund = null,
//         amount,
//         category,
//         reference,
//         description,
//         metadata = {},
//         session
//     }) {

//         const wallet = await Wallet.findOne({
//             owner: userId,
//             ownerType: "USER",
//             status: "ACTIVE"
//         }).session(session);

//         if (!wallet) {
//             throw new Error("User wallet not found.");
//         }

//         if (wallet.balance < amount) {
//             throw new Error("Insufficient wallet balance.");
//         }

//         const balanceBefore = wallet.balance;

//         wallet.debit(amount);

//         await wallet.save({ session });

//         await Ledger.create([{
//             wallet: wallet._id,

//             payment: payment?._id || null,

//             order: order?._id || null,

//             refund: refund?._id || null,

//             type: "DEBIT",

//             category,

//             amount,

//             currency: wallet.currency,

//             balanceBefore,

//             balanceAfter: wallet.balance,

//             reference,

//             description,

//             status: "COMPLETED",

//             metadata
//         }], { session });

//         return wallet;
//     }

//     static async getWalletDashboard(userId) {

//         const wallet = await Wallet.findOne({
//             owner: userId,
//             ownerType: "USER"
//         });

//         if (!wallet) {
//             throw new Error("Wallet not found");
//         }

//         const summary = await Ledger.aggregate([

//             {
//                 $match: {
//                     wallet: wallet._id,
//                     status: "COMPLETED"
//                 }
//             },

//             {
//                 $group: {

//                     _id: null,

//                     totalCredit: {
//                         $sum: {
//                             $cond: [
//                                 { $eq: ["$type", "CREDIT"] },
//                                 "$amount",
//                                 0
//                             ]
//                         }
//                     },

//                     totalWithdrawal: {
//                         $sum: {
//                             $cond: [
//                                 {
//                                     $and: [
//                                         { $eq: ["$type", "DEBIT"] },
//                                         { $eq: ["$category", "PAYOUT_REQUEST"] }
//                                     ]
//                                 },
//                                 "$amount",
//                                 0
//                             ]
//                         }
//                     },

//                     totalEscrow: {
//                         $sum: {
//                             $cond: [
//                                 {
//                                     $eq: [
//                                         "$category",
//                                         "ESCROW_DEPOSIT"
//                                     ]
//                                 },
//                                 "$amount",
//                                 0
//                             ]
//                         }
//                     },

//                     totalRefund: {
//                         $sum: {
//                             $cond: [
//                                 {
//                                     $eq: [
//                                         "$category",
//                                         "ESCROW_REFUND"
//                                     ]
//                                 },
//                                 "$amount",
//                                 0
//                             ]
//                         }
//                     }

//                 }
//             }

//         ]);

//         const transactions = await Ledger.find({
//             wallet: wallet._id
//         })
//             .sort({ createdAt: -1 })
//             .limit(20)
//             .populate("payment")
//             .populate({
//                     path: "order",
//                     populate: {
//                         path: "property",
//                         select: "title slug type purpose pricing media.images"
//                     }
//                 });
            

//         return {

//             wallet,

//             summary: summary[0] || {
//                 totalCredit: 0,
//                 totalWithdrawal: 0,
//                 totalEscrow: 0,
//                 totalRefund: 0
//             },

//             transactions

//         };

//     };

// }

// export default WalletService;

// import mongoose from "mongoose";
// import Wallet from "../model/Wallet.js";
// import Ledger from "../model/Ledger.js";
// import Usertp from "../model/Usertp.js";


class WalletService {

    /*
    |--------------------------------------------------------------------------
    | CREDIT PLATFORM WALLET
    |--------------------------------------------------------------------------
    */

    static async creditPlatformWallet({
        payment,
        order,
        amount,
        transaction,
        session
    }) {

        amount = Number(amount);

        if (!payment?._id) {
            throw new Error("Payment is required.");
        }

        if (!order?._id) {
            throw new Error("Order is required.");
        }

        if (!amount || amount <= 0) {
            throw new Error("Invalid credit amount.");
        }


        /*
        |--------------------------------------------------------------------------
        | 1. Find Platform Wallet
        |--------------------------------------------------------------------------
        */

        const wallet = await Wallet.findOne({
            ownerType: "PLATFORM",
            status: "ACTIVE"
        }).session(session);

        if (!wallet) {
            throw new Error(
                "Platform wallet not found."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | 2. Check Duplicate Ledger
        |--------------------------------------------------------------------------
        |
        | This protects against the same payment being credited twice.
        |
        */

        const existingLedger = await Ledger.findOne({
            payment: payment._id,
            category: "ESCROW_DEPOSIT",
            type: "CREDIT"
        }).session(session);

        if (existingLedger) {

            return await Wallet.findById(
                wallet._id
            ).session(session);
        }


        /*
        |--------------------------------------------------------------------------
        | 3. Atomic Wallet Credit
        |--------------------------------------------------------------------------
        |
        | $inc is atomic.
        |
        | MongoDB handles concurrent updates safely.
        |
        */

        const updatedWallet =
            await Wallet.findOneAndUpdate(
                {
                    _id: wallet._id,
                    ownerType: "PLATFORM",
                    status: "ACTIVE"
                },
                {
                    $inc: {
                        balance: amount
                    }
                },
                {
                    new: true,
                    session
                }
            );


        if (!updatedWallet) {
            throw new Error(
                "Unable to credit platform wallet."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | 4. Calculate Ledger Balance
        |--------------------------------------------------------------------------
        */

        const balanceAfter =
            Number(updatedWallet.balance);

        const balanceBefore =
            balanceAfter - amount;


        /*
        |--------------------------------------------------------------------------
        | 5. Create Ledger
        |--------------------------------------------------------------------------
        */

        try {

            await Ledger.create(
                [{
                    wallet: updatedWallet._id,

                    payment: payment._id,

                    order: order._id,

                    type: "CREDIT",

                    category: "ESCROW_DEPOSIT",

                    amount,

                    currency: payment.currency,

                    balanceBefore,

                    balanceAfter,

                    reference: payment.txRef,

                    description:
                        `Escrow funding for Order ${order.orderNumber || order._id}`,

                    status: "COMPLETED",

                    metadata: {
                        gateway: "PAYSTACK",

                        transactionId:
                            transaction?.id,

                        paidAmount:
                            transaction?.amount,

                        gatewayFee:
                            transaction?.fees || 0,

                        channel:
                            transaction?.channel,

                        customerEmail:
                            transaction?.customer?.email
                    }
                }],
                {
                    session
                }
            );

        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | Duplicate Ledger Protection
            |--------------------------------------------------------------------------
            */

            if (error.code === 11000) {

                throw new Error(
                    "This payment has already been credited."
                );
            }

            throw error;
        }


        return updatedWallet;
    }



    /*
    |--------------------------------------------------------------------------
    | DEBIT PLATFORM WALLET
    |--------------------------------------------------------------------------
    */

    static async debitPlatformWallet({
        payment = null,
        order = null,
        refund = null,
        amount,
        category,
        reference,
        description,
        metadata = {},
        session
    }) {

        amount = Number(amount);

        if (!amount || amount <= 0) {
            throw new Error(
                "Invalid debit amount."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | 1. Check Existing Transaction
        |--------------------------------------------------------------------------
        */

        if (reference) {

            const existingLedger =
                await Ledger.findOne({
                    reference,
                    type: "DEBIT",
                    category
                }).session(session);

            if (existingLedger) {

                return await Wallet.findById(
                    existingLedger.wallet
                ).session(session);
            }
        }


        /*
        |--------------------------------------------------------------------------
        | 2. Find Wallet
        |--------------------------------------------------------------------------
        */

        const wallet = await Wallet.findOne({
            ownerType: "PLATFORM",
            status: "ACTIVE"
        }).session(session);

        if (!wallet) {
            throw new Error(
                "Platform wallet not found."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | 3. Atomic Debit
        |--------------------------------------------------------------------------
        |
        | IMPORTANT:
        |
        | balance >= amount is included in the query.
        |
        | MongoDB atomically checks and subtracts.
        |
        */

        const updatedWallet =
            await Wallet.findOneAndUpdate(
                {
                    _id: wallet._id,

                    ownerType: "PLATFORM",

                    status: "ACTIVE",

                    balance: {
                        $gte: amount
                    }
                },
                {
                    $inc: {
                        balance: -amount
                    }
                },
                {
                    new: true,
                    session
                }
            );


        if (!updatedWallet) {
            throw new Error(
                "Insufficient platform wallet balance."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | 4. Calculate Balances
        |--------------------------------------------------------------------------
        */

        const balanceAfter =
            Number(updatedWallet.balance);

        const balanceBefore =
            balanceAfter + amount;


        /*
        |--------------------------------------------------------------------------
        | 5. Create Ledger
        |--------------------------------------------------------------------------
        */

        try {

            await Ledger.create(
                [{
                    wallet: updatedWallet._id,

                    payment:
                        payment?._id || null,

                    order:
                        order?._id || null,

                    refund:
                        refund?._id || null,

                    type: "DEBIT",

                    category,

                    amount,

                    currency:
                        updatedWallet.currency,

                    balanceBefore,

                    balanceAfter,

                    reference,

                    description,

                    status: "COMPLETED",

                    metadata
                }],
                {
                    session
                }
            );

        } catch (error) {

            if (error.code === 11000) {

                throw new Error(
                    "This debit transaction has already been processed."
                );
            }

            throw error;
        }


        return updatedWallet;
    }



    /*
    |--------------------------------------------------------------------------
    | CREDIT USER WALLET
    |--------------------------------------------------------------------------
    */

    static async creditUserWallet({
        userId,
        payment = null,
        order = null,
        refund = null,
        amount,
        category,
        reference,
        description,
        metadata = {},
        session
    }) {

        amount = Number(amount);

        if (!amount || amount <= 0) {
            throw new Error(
                "Invalid credit amount."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | 1. Find User Wallet
        |--------------------------------------------------------------------------
        */

        let wallet = await Wallet.findOne({
            owner: userId,
            ownerType: "USER",
            status: "ACTIVE"
        }).session(session);


        /*
        |--------------------------------------------------------------------------
        | 2. Create Wallet If Missing
        |--------------------------------------------------------------------------
        */

        if (!wallet) {

            const user =
                await Usertp.findById(userId)
                    .session(session);

            if (!user) {
                throw new Error(
                    "User not found."
                );
            }


            try {

                const wallets =
                    await Wallet.create(
                        [{
                            owner: user._id,

                            ownerType: "USER",

                            currency: "NGN",

                            balance: 0,

                            status: "ACTIVE"
                        }],
                        {
                            session
                        }
                    );

                wallet = wallets[0];

            } catch (error) {

                /*
                |--------------------------------------------------------------------------
                | Another concurrent request may have created wallet
                |--------------------------------------------------------------------------
                */

                if (error.code === 11000) {

                    wallet =
                        await Wallet.findOne({
                            owner: userId,
                            ownerType: "USER",
                            status: "ACTIVE"
                        }).session(session);

                } else {

                    throw error;
                }
            }
        }


        /*
        |--------------------------------------------------------------------------
        | 3. Duplicate Protection
        |--------------------------------------------------------------------------
        */

        if (reference) {

            const existingLedger =
                await Ledger.findOne({
                    reference,
                    type: "CREDIT",
                    category
                }).session(session);

            if (existingLedger) {

                return await Wallet.findById(
                    existingLedger.wallet
                ).session(session);
            }
        }


        /*
        |--------------------------------------------------------------------------
        | 4. Atomic Credit
        |--------------------------------------------------------------------------
        */

        const updatedWallet =
            await Wallet.findOneAndUpdate(
                {
                    _id: wallet._id,

                    owner: userId,

                    ownerType: "USER",

                    status: "ACTIVE"
                },
                {
                    $inc: {
                        balance: amount
                    }
                },
                {
                    new: true,
                    session
                }
            );


        if (!updatedWallet) {
            throw new Error(
                "Unable to credit user wallet."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | 5. Calculate Balances
        |--------------------------------------------------------------------------
        */

        const balanceAfter =
            Number(updatedWallet.balance);

        const balanceBefore =
            balanceAfter - amount;


        /*
        |--------------------------------------------------------------------------
        | 6. Create Ledger
        |--------------------------------------------------------------------------
        */

        try {

            await Ledger.create(
                [{
                    wallet: updatedWallet._id,

                    payment:
                        payment?._id || null,

                    order:
                        order?._id || null,

                    refund:
                        refund?._id || null,

                    type: "CREDIT",

                    category,

                    amount,

                    currency:
                        updatedWallet.currency,

                    balanceBefore,

                    balanceAfter,

                    reference,

                    description,

                    status: "COMPLETED",

                    metadata
                }],
                {
                    session
                }
            );

        } catch (error) {

            if (error.code === 11000) {

                throw new Error(
                    "This credit transaction has already been processed."
                );
            }

            throw error;
        }


        return updatedWallet;
    }



    /*
    |--------------------------------------------------------------------------
    | DEBIT USER WALLET
    |--------------------------------------------------------------------------
    */

    static async debitUserWallet({
        userId,
        payment = null,
        order = null,
        refund = null,
        amount,
        category,
        reference,
        description,
        metadata = {},
        session
    }) {

        amount = Number(amount);

        if (!amount || amount <= 0) {
            throw new Error(
                "Invalid debit amount."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | 1. Duplicate Protection
        |--------------------------------------------------------------------------
        */

        if (reference) {

            const existingLedger =
                await Ledger.findOne({
                    reference,
                    type: "DEBIT",
                    category
                }).session(session);

            if (existingLedger) {

                return await Wallet.findById(
                    existingLedger.wallet
                ).session(session);
            }
        }


        /*
        |--------------------------------------------------------------------------
        | 2. Atomic Debit
        |--------------------------------------------------------------------------
        */

        const updatedWallet =
            await Wallet.findOneAndUpdate(
                {
                    owner: userId,

                    ownerType: "USER",

                    status: "ACTIVE",

                    balance: {
                        $gte: amount
                    }
                },
                {
                    $inc: {
                        balance: -amount
                    }
                },
                {
                    new: true,
                    session
                }
            );


        if (!updatedWallet) {
            throw new Error(
                "Insufficient wallet balance."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | 3. Calculate Balances
        |--------------------------------------------------------------------------
        */

        const balanceAfter =
            Number(updatedWallet.balance);

        const balanceBefore =
            balanceAfter + amount;


        /*
        |--------------------------------------------------------------------------
        | 4. Create Ledger
        |--------------------------------------------------------------------------
        */

        try {

            await Ledger.create(
                [{
                    wallet: updatedWallet._id,

                    payment:
                        payment?._id || null,

                    order:
                        order?._id || null,

                    refund:
                        refund?._id || null,

                    type: "DEBIT",

                    category,

                    amount,

                    currency:
                        updatedWallet.currency,

                    balanceBefore,

                    balanceAfter,

                    reference,

                    description,

                    status: "COMPLETED",

                    metadata
                }],
                {
                    session
                }
            );

        } catch (error) {

            if (error.code === 11000) {

                throw new Error(
                    "This debit transaction has already been processed."
                );
            }

            throw error;
        }


        return updatedWallet;
    }



    /*
    |--------------------------------------------------------------------------
    | GET WALLET DASHBOARD
    |--------------------------------------------------------------------------
    */

    static async getWalletDashboard(userId) {

        const wallet = await Wallet.findOne({
            owner: userId,
            ownerType: "USER"
        });

        if (!wallet) {
            throw new Error(
                "Wallet not found."
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Summary
        |--------------------------------------------------------------------------
        */

        const summary =
            await Ledger.aggregate([

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

                                    {
                                        $eq: [
                                            "$type",
                                            "CREDIT"
                                        ]
                                    },

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

                                            {
                                                $eq: [
                                                    "$type",
                                                    "DEBIT"
                                                ]
                                            },

                                            {
                                                $eq: [
                                                    "$category",
                                                    "PAYOUT_REQUEST"
                                                ]
                                            }

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
                                            "ESCROW_DEPOSIT"
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


        /*
        |--------------------------------------------------------------------------
        | Recent Transactions
        |--------------------------------------------------------------------------
        */

        const transactions =
            await Ledger.find({
                wallet: wallet._id
            })
                .sort({
                    createdAt: -1
                })
                .limit(20)

                .populate("payment")

                .populate({
                    path: "order",

                    populate: {
                        path: "property",

                        select:
                            "title slug type purpose pricing media.images"
                    }
                });


        return {

            wallet,

            summary:
                summary[0] || {

                    totalCredit: 0,

                    totalWithdrawal: 0,

                    totalEscrow: 0,

                    totalRefund: 0

                },

            transactions

        };

    }

}


export default WalletService;