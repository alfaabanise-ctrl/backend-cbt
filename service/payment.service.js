// services/payment.service.js

import Payment from "../model/payments.js";
import Propert from "../model/Property.js";
import PropertyOrder from "../model/PropertyOrder.js";
import FlutterwaveService from "./flutterwave.service.js";
import PaystackService from "./paystack.service.js";

import mongoose from "mongoose";
import WalletService from "./WalletService.js";

function generateTransactionRef(orderNumber) {
    const random = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    return `${orderNumber}-${Date.now()}-${random}`;
}


function calculatePaystackFee(amount) {
    amount = Number(amount);

    let fee = amount * 0.015;

    if (amount >= 2500) {
        fee += 100;
    }

    if (fee > 2000) {
        fee = 2000;
    }

    return Math.round(fee);
}

class PaymentService {


    static async createOrderPayment({ buyer, propertyId, totalPlot, amount }) {

        // Find property
        const property = await Propert.findById(propertyId).populate("userId");

        if (!property) {
            throw new Error("Property not found.");
        }
        console.log(property._id, buyer._id);

        // Existing order
        let order = await PropertyOrder.findOne({
            property: property._id,
            buyer: buyer._id
        });
        console.log(order, 'fff');


        // Buyer payment (Frontend sends Naira)
        const amountToPayKobo = Math.round(Number(amount) * 100);
        console.log(amountToPayKobo);

        let totalAmountKobo = 0;
        let pricePerPlotKobo = null;

        if (!order) {

            if (property.type === "land") {

                if (!totalPlot || totalPlot < 1) {
                    throw new Error("Invalid number of plots.");
                }

                if (totalPlot > property.landDetails.quantity) {
                    throw new Error("Selected plots exceed available plots.");
                }

                pricePerPlotKobo = Math.round(
                    Number(property.pricing.price) * 100
                );

                totalAmountKobo = pricePerPlotKobo * Number(totalPlot);

            } else {

                totalAmountKobo = Math.round(
                    Number(property.pricing.price) * 100
                );

            }

        } else {

            totalAmountKobo = order.totalAmount;
            pricePerPlotKobo = order.pricePerPlot;

        }

        // Prevent over-payment
        if (amountToPayKobo > totalAmountKobo) {
            throw new Error("Payment amount exceeds outstanding balance.");
        }

        const txRef = generateTransactionRef(
            order?.orderNumber || `ORD-${Date.now()}`
        );

        // Initialize Paystack (expects Kobo)
        const response = await PaystackService.initializeTransaction({

            reference: txRef,

            email: buyer.email,

            amount: amountToPayKobo,

            currency: "NGN",

            callback_url:
                `${process.env.FRONTEND_BASE_URL}property/payment/${property.slug}`,

            metadata: {
                title: "Property Purchase",
                description: property.title,
                logo: process.env.APP_LOGO
            }

        });

        const session = await mongoose.startSession();

        try {

            session.startTransaction();

            if (!order) {

                const orders = await PropertyOrder.create([{

                    orderNumber:
                        `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,

                    property: property._id,

                    buyer: buyer._id,

                    seller: property.userId._id,

                    totalPlot: property.type === "land"
                        ? totalPlot
                        : null,

                    pricePerPlot: pricePerPlotKobo,

                    totalAmount: totalAmountKobo,

                    escrowAmount: 0,

                    escrowStatus: "NOT_FUNDED",

                    orderStatus: "PENDING"

                }], { session });

                order = orders[0];

            }

            const payments = await Payment.create([{

                txRef,

                payer: buyer._id,

                receiver: property.userId._id,

                property: property._id,

                order: order._id,

                amount: amountToPayKobo,

                currency: "NGN",

                payment_link: response.data.authorization_url,

                purpose:
                    amountToPayKobo >= totalAmountKobo
                        ? "PROPERTY_BALANCE"
                        : "PROPERTY_DEPOSIT",

                status: "PENDING",

                metadata: {
                    checkoutUrl: response.data.authorization_url
                }

            }], { session });

            await session.commitTransaction();

            return {
                otherDetails: response,
                payment: payments[0],
                order,
                checkoutUrl: response.data.authorization_url
            };

        } catch (err) {

            await session.abortTransaction();
            throw err;

        } finally {

            session.endSession();

        }

    }

    // static async verifyOrderPayment(txRef) {

    //     let paymentId;

    //     /*
    //     ============================================================
    //     STEP 1
    //     ATOMICALLY CLAIM PAYMENT
    //     ============================================================
    //     */

    //     const payment = await Payment.findOneAndUpdate(
    //         {
    //             txRef,
    //             status: "PENDING"
    //         },
    //         {
    //             $set: {
    //                 status: "PROCESSING",
    //                 processingStartedAt: new Date()
    //             }
    //         },
    //         {
    //             new: true
    //         }
    //     );

    //     /*
    //     ============================================================
    //     PAYMENT NOT CLAIMED
    //     ============================================================
    //     */

    //     if (!payment) {

    //         const existingPayment =
    //             await Payment.findOne({ txRef });

    //         if (!existingPayment) {
    //             throw new Error("Payment not found.");
    //         }

    //         /*
    //         Already successfully processed.
    //         This makes verification idempotent.
    //         */

    //         if (existingPayment.status === "SUCCESS") {
    //             return existingPayment;
    //         }

    //         /*
    //         Another request is processing it.
    //         */

    //         if (existingPayment.status === "PROCESSING") {

    //             throw new Error(
    //                 "Payment is currently being processed."
    //             );
    //         }

    //         if (existingPayment.status === "FAILED") {

    //             throw new Error(
    //                 existingPayment.failureReason ||
    //                 "Payment verification previously failed."
    //             );
    //         }

    //         throw new Error(
    //             `Payment cannot be processed from status ${existingPayment.status}.`
    //         );
    //     }

    //     paymentId = payment._id;

    //     /*
    //     ============================================================
    //     STEP 2
    //     VERIFY WITH PAYSTACK
    //     IMPORTANT:
    //     DO NOT KEEP A MONGODB TRANSACTION OPEN
    //     WHILE WAITING FOR PAYSTACK.
    //     ============================================================
    //     */

    //     let result;

    //     try {

    //         result =
    //             await PaystackService.verifyTransaction(txRef);
    //         console.log(result);


    //     } catch (error) {

    //         /*
    //         Paystack API/network error.
    
    //         Return payment to PENDING so it can be retried.
    //         */

    //         await Payment.updateOne(
    //             {
    //                 _id: paymentId,
    //                 status: "PROCESSING"
    //             },
    //             {
    //                 $set: {
    //                     status: "PENDING",
    //                     lastVerificationError: error.message,
    //                     lastVerificationAttemptAt: new Date()
    //                 },
    //                 $inc: {
    //                     verificationAttempts: 1
    //                 }
    //             }
    //         );

    //         throw error;
    //     }

    //     const transaction = result?.data;

    //     /*
    //     ============================================================
    //     STEP 3
    //     PAYMENT FAILED AT GATEWAY
    //     ============================================================
    //     */

    //     if (
    //         !transaction ||
    //         transaction.status !== "success"
    //     ) {

    //         await Payment.updateOne(
    //             {
    //                 _id: paymentId,
    //                 status: "PROCESSING"
    //             },
    //             {
    //                 $set: {
    //                     status: "FAILED",
    //                     paymentStatus: "FAILED",
    //                     failureReason:
    //                         transaction?.gateway_response ||
    //                         "Payment was not successful.",
    //                     lastVerificationAttemptAt: new Date()
    //                 },
    //                 $inc: {
    //                     verificationAttempts: 1
    //                 }
    //             }
    //         );

    //         throw new Error(
    //             transaction?.gateway_response ||
    //             "Payment was not successful."
    //         );
    //     }

    //     /*
    //     ============================================================
    //     STEP 4
    //     VALIDATE PAYMENT
    //     ============================================================
    //     */

    //     if (
    //         transaction.currency !==
    //         payment.currency
    //     ) {

    //         await Payment.updateOne(
    //             {
    //                 _id: paymentId,
    //                 status: "PROCESSING"
    //             },
    //             {
    //                 $set: {
    //                     status: "FAILED",
    //                     paymentStatus: "FAILED",
    //                     failureReason: "Currency mismatch."
    //                 }
    //             }
    //         );

    //         throw new Error(
    //             "Currency mismatch."
    //         );
    //     }

    //     if (
    //         Number(transaction.amount) <
    //         Number(payment.amount)
    //     ) {

    //         await Payment.updateOne(
    //             {
    //                 _id: paymentId,
    //                 status: "PROCESSING"
    //             },
    //             {
    //                 $set: {
    //                     status: "FAILED",
    //                     paymentStatus: "FAILED",
    //                     failureReason:
    //                         "Incorrect payment amount."
    //                 }
    //             }
    //         );

    //         throw new Error(
    //             "Incorrect payment amount."
    //         );
    //     }

    //     /*
    //     ============================================================
    //     STEP 5
    //     CALCULATE AMOUNTS
    //     ============================================================
    //     */

    //     const paidAmount =
    //         Number(transaction.amount);

    //     const gatewayFee =
    //         Number(transaction.fees || 0);

    //     const creditAmount =
    //         Math.max(
    //             paidAmount - gatewayFee,
    //             0
    //         );

    //     /*
    //     ============================================================
    //     STEP 6
    //     NOW START MONGODB TRANSACTION
    //     ============================================================
    //     */

    //     const session =
    //         await mongoose.startSession();

    //     try {

    //         await session.withTransaction(
    //             async () => {

    //                 /*
    //                 ====================================================
    //                 RELOAD PAYMENT INSIDE TRANSACTION
    //                 ====================================================
    //                 */

    //                 const lockedPayment =
    //                     await Payment.findOne({
    //                         _id: paymentId,
    //                         status: "PROCESSING"
    //                     }).session(session);

    //                 if (!lockedPayment) {

    //                     /*
    //                     Another process may have completed it.
    //                     */

    //                     const currentPayment =
    //                         await Payment.findById(
    //                             paymentId
    //                         ).session(session);

    //                     if (
    //                         currentPayment?.status ===
    //                         "SUCCESS"
    //                     ) {
    //                         return;
    //                     }

    //                     throw new Error(
    //                         "Payment is no longer available for processing."
    //                     );
    //                 }

    //                 /*
    //                 ====================================================
    //                 FIND ORDER
    //                 ====================================================
    //                 */

    //                 const order =
    //                     await PropertyOrder.findById(
    //                         lockedPayment.order
    //                     ).session(session);

    //                 if (!order) {
    //                     throw new Error(
    //                         "Order not found."
    //                     );
    //                 }

    //                 /*
    //                 ====================================================
    //                 FIND PROPERTY
    //                 ====================================================
    //                 */

    //                 const property =
    //                     await Propert.findById(
    //                         lockedPayment.property
    //                     ).session(session);

    //                 if (!property) {
    //                     throw new Error(
    //                         "Property not found."
    //                     );
    //                 }

    //                 /*
    //                 ====================================================
    //                 CALCULATE ESCROW
    //                 ====================================================
    //                 */

    //                 const remainingBefore =
    //                     Math.max(
    //                         Number(order.totalAmount || 0) -
    //                         Number(order.escrowAmount || 0),
    //                         0
    //                     );

    //                 const escrowCredit =
    //                     Math.min(
    //                         creditAmount,
    //                         remainingBefore
    //                     );

    //                 /*
    //                 ====================================================
    //                 UPDATE PAYMENT
    //                 ====================================================
    //                 */

    //                 lockedPayment.status =
    //                     "SUCCESS";

    //                 lockedPayment.paymentStatus =
    //                     "PAID";

    //                 lockedPayment.TransactionId =
    //                     transaction.id;

    //                 lockedPayment.gatewayResponse =
    //                     transaction.gateway_response;

    //                 lockedPayment.channel =
    //                     transaction.channel;

    //                 lockedPayment.authorizationCode =
    //                     transaction.authorization
    //                         ?.authorization_code ||
    //                     null;

    //                 lockedPayment.paidAmount =
    //                     paidAmount;

    //                 lockedPayment.gatewayFee =
    //                     gatewayFee;

    //                 lockedPayment.creditAmount =
    //                     creditAmount;

    //                 lockedPayment.paidAt =
    //                     transaction.paid_at ||
    //                     new Date();

    //                 await lockedPayment.save({
    //                     session
    //                 });

    //                 /*
    //                 ====================================================
    //                 PROPERTY
    //                 ====================================================
    //                 */

    //                 property.status =
    //                     "off_market";

    //                 await property.save({
    //                     session
    //                 });

    //                 /*
    //                 ====================================================
    //                 CREDIT PLATFORM WALLET
    
    //                 THIS MUST BE IDEMPOTENT
    //                 ====================================================
    //                 */

    //                 await WalletService.creditPlatformWallet({
    //                     payment: lockedPayment,
    //                     order,
    //                     amount: creditAmount,
    //                     transaction,
    //                     session
    //                 });

    //                 /*
    //                 ====================================================
    //                 UPDATE ORDER
    //                 ====================================================
    //                 */

    //                 order.escrowAmount =
    //                     Number(
    //                         order.escrowAmount || 0
    //                     ) +
    //                     escrowCredit;

    //                 order.remainingAmount =
    //                     Math.max(
    //                         Number(order.totalAmount || 0) -
    //                         order.escrowAmount,
    //                         0
    //                     );

    //                 /*
    //                 ====================================================
    //                 ORDER STATUS
    //                 ====================================================
    //                 */

    //                 if (
    //                     order.remainingAmount <= 0
    //                 ) {

    //                     order.remainingAmount =
    //                         0;

    //                     order.escrowStatus =
    //                         "FUNDED";

    //                     order.orderStatus =
    //                         "PAID";

    //                     order.paymentStatus =
    //                         "FULLY_PAID";

    //                 } else {

    //                     order.escrowStatus =
    //                         "PARTIALLY_FUNDED";

    //                     order.orderStatus =
    //                         "PENDING";

    //                     order.paymentStatus =
    //                         "PARTIALLY_PAID";
    //                 }

    //                 await order.save({
    //                     session
    //                 });
    //             }
    //         );

    //         console.log(
    //             "Payment successfully processed:",
    //             txRef
    //         );

    //         return await Payment.findById(
    //             paymentId
    //         );

    //     } catch (error) {

    //         /*
    //         ========================================================
    //         IMPORTANT
    
    //         Do not immediately mark SUCCESS payment as FAILED.
    
    //         The transaction may have failed because of a transient
    //         MongoDB write conflict.
    
    //         Return it to PENDING so the entire operation can retry.
    //         ========================================================
    //         */

    //         if (
    //             error?.errorLabels?.includes(
    //                 "TransientTransactionError"
    //             ) ||
    //             error?.code === 112
    //         ) {

    //             await Payment.updateOne(
    //                 {
    //                     _id: paymentId,
    //                     status: "PROCESSING"
    //                 },
    //                 {
    //                     $set: {
    //                         status: "PENDING",
    //                         lastVerificationError:
    //                             error.message,
    //                         lastVerificationAttemptAt:
    //                             new Date()
    //                     },
    //                     $inc: {
    //                         verificationAttempts: 1
    //                     }
    //                 }
    //             );

    //         } else {

    //             /*
    //             Business/database error.
    
    //             Keep it retryable unless you know it is a permanent
    //             payment validation failure.
    //             */

    //             await Payment.updateOne(
    //                 {
    //                     _id: paymentId,
    //                     status: "PROCESSING"
    //                 },
    //                 {
    //                     $set: {
    //                         status: "PENDING",
    //                         lastVerificationError:
    //                             error.message,
    //                         lastVerificationAttemptAt:
    //                             new Date()
    //                     },
    //                     $inc: {
    //                         verificationAttempts: 1
    //                     }
    //                 }
    //             );
    //         }

    //         console.error(
    //             `Payment verification failed for ${txRef}:`,
    //             error
    //         );

    //         throw error;

    //     } finally {

    //         await session.endSession();
    //     }
    // }
    // static async verifyOrderPayment(txRef) {
    //     const session = await mongoose.startSession();

    //     try {
    //         await session.startTransaction();

    //         /*--------------------------------------------------
    //         Find Payment
    //         --------------------------------------------------*/
    //         const payment = await Payment.findOne({ txRef }).session(session);

    //         if (!payment) {
    //             throw new Error("Payment not found.");
    //         }

    //         // Already verified
    //         if (payment.status === "SUCCESS") {
    //             await session.commitTransaction();
    //             return payment;
    //         }

    //         /*--------------------------------------------------
    //         Verify with Paystack
    //         --------------------------------------------------*/
    //         const result = await PaystackService.verifyTransaction(txRef);

    //         const transaction = result.data;

    //         if (!transaction || transaction.status !== "success") {
    //             throw new Error("Payment was not successful.");
    //         }

    //         if (transaction.currency !== payment.currency) {
    //             throw new Error("Currency mismatch.");
    //         }

    //         if (transaction.amount < payment.amount) {
    //             throw new Error("Incorrect payment amount.");
    //         }

    //         /*--------------------------------------------------
    //         Find Order
    //         --------------------------------------------------*/
    //         const order = await PropertyOrder.findById(payment.order).session(session);

    //         if (!order) {
    //             throw new Error("Order not found.");
    //         }

    //         /*--------------------------------------------------
    //         Calculate Amounts
    //         --------------------------------------------------*/
    //         const paidAmount = transaction.amount;
    //         const gatewayFee = transaction.fees || 0;
    //         const creditAmount = paidAmount - gatewayFee;

    //         // Don't allow escrow to exceed total amount
    //         const remainingBefore = order.totalAmount - order.escrowAmount;

    //         const escrowCredit = Math.min(creditAmount, remainingBefore);

    //         /*--------------------------------------------------
    //         Update Payment
    //         --------------------------------------------------*/
    //         payment.status = "SUCCESS";
    //         payment.paymentStatus = "PAID";
    //         payment.TransactionId = transaction.id;
    //         payment.gatewayResponse = transaction.gateway_response;
    //         payment.channel = transaction.channel;
    //         payment.authorizationCode =
    //             transaction.authorization?.authorization_code || null;

    //         payment.paidAmount = paidAmount;
    //         payment.gatewayFee = gatewayFee;
    //         payment.creditAmount = creditAmount;
    //         payment.paidAt = transaction.paid_at || new Date();

    //         await payment.save({ session });
    //         /*--------------------------------------------------
    //         Update Property
    //         --------------------------------------------------*/
    //         const property =  await Propert.findById(payment.property).session()
    //         property.status = "off_market";
    //          await property.save({ session });
    //         /*--------------------------------------------------
    //         Credit Platform Wallet
    //         --------------------------------------------------*/
    //       const walletresult =  await WalletService.creditPlatformWallet({
    //             payment,
    //             order,
    //             amount: creditAmount,
    //             transaction,
    //             session
    //         });

    //         /*--------------------------------------------------
    //         Update Order Escrow
    //         --------------------------------------------------*/
    //         order.escrowAmount += escrowCredit;

    //         order.remainingAmount = Math.max(
    //             order.totalAmount - order.escrowAmount,
    //             0
    //         );

    //         if (order.remainingAmount === 0) {
    //             order.escrowStatus = "FUNDED";
    //             order.orderStatus = "PAID";
    //         } else {
    //             order.escrowStatus = "PARTIALLY_FUNDED";
    //             order.orderStatus = "PENDING";
    //         }

    //         await order.save({ session });
    //         console.log(walletresult, 'walletresult');
    //         console.log(order, "orders");

    //          console.log(payment, 'payment');

    //         /*--------------------------------------------------
    //         Commit
    //         --------------------------------------------------*/
    //         await session.commitTransaction();

    //         return payment;

    //     } catch (error) {

    //         await session.abortTransaction();
    //         throw error;

    //     } finally {

    //         await session.endSession();

    //     }
    // }

    static async verifyOrderPayment(txRef) {
    let paymentId;

    /*
    ============================================================
    STEP 1
    ATOMICALLY CLAIM PAYMENT
    ============================================================
    */

    const payment = await Payment.findOneAndUpdate(
        {
            txRef,
            status: "PENDING"
        },
        {
            $set: {
                status: "PROCESSING",
                processingStartedAt: new Date(),
                lastVerificationAttemptAt: new Date()
            },
            $inc: {
                verificationAttempts: 1
            }
        },
        {
            new: true
        }
    );

    /*
    ============================================================
    PAYMENT WAS NOT CLAIMED
    ============================================================
    */

    if (!payment) {
        const existingPayment =
            await Payment.findOne({ txRef });

        if (!existingPayment) {
            throw new Error(
                "Payment not found."
            );
        }

        /*
        Already successfully processed.
        */

        if (
            existingPayment.status ===
            "SUCCESS"
        ) {
            return existingPayment;
        }

        /*
        Another worker is processing it.
        */

        if (
            existingPayment.status ===
            "PROCESSING"
        ) {
            throw new Error(
                "Payment is currently being processed."
            );
        }

        /*
        Permanently failed.
        */

        if (
            existingPayment.status ===
            "FAILED"
        ) {
            throw new Error(
                existingPayment.failureReason ||
                "Payment verification previously failed."
            );
        }

        throw new Error(
            `Payment cannot be processed from status ${existingPayment.status}.`
        );
    }

    paymentId = payment._id;

    /*
    ============================================================
    STEP 2
    VERIFY PAYMENT WITH PAYSTACK
    ============================================================
    */

    let result;

    try {
        result =
            await PaystackService.verifyTransaction(
                txRef
            );

        console.log(
            `Paystack verification response for ${txRef}:`,
            result
        );

    } catch (error) {

        /*
        ========================================================
        PAYSTACK API / NETWORK ERROR

        This is NOT a payment failure.

        Return payment to PENDING so the 5-minute
        background job can retry.
        ========================================================
        */

        await Payment.updateOne(
            {
                _id: paymentId,
                status: "PROCESSING"
            },
            {
                $set: {
                    status: "PENDING",

                    lastVerificationError:
                        error?.message ||
                        "Unable to contact Paystack.",

                    lastVerificationAttemptAt:
                        new Date(),

                    processingStartedAt:
                        null
                }
            }
        );

        console.error(
            `Paystack verification API error for ${txRef}:`,
            error
        );

        throw error;
    }

    const transaction =
        result?.data;

    /*
    ============================================================
    STEP 3
    NO TRANSACTION RESPONSE
    ============================================================
    */

    if (!transaction) {

        await Payment.updateOne(
            {
                _id: paymentId,
                status: "PROCESSING"
            },
            {
                $set: {
                    status: "PENDING",

                    lastVerificationError:
                        "Paystack did not return transaction data.",

                    lastVerificationAttemptAt:
                        new Date(),

                    processingStartedAt:
                        null
                }
            }
        );

        throw new Error(
            "Paystack did not return transaction data."
        );
    }

    /*
    ============================================================
    STEP 4
    READ PAYSTACK STATUS
    ============================================================
    */

    const transactionStatus =
        String(
            transaction.status ||
            ""
        ).toLowerCase();

    console.log(
        `Transaction ${txRef} Paystack status:`,
        transactionStatus
    );

    /*
    ============================================================
    STEP 5
    RETRYABLE PAYMENT STATUS

    These payments are not successful yet,
    but they should NOT be permanently failed.

    The internal scheduler can retry them later.
    ============================================================
    */

    const retryableStatuses = [
        "pending",
        "processing",
        "ongoing"
    ];

    if (
        retryableStatuses.includes(
            transactionStatus
        )
    ) {

        await Payment.updateOne(
            {
                _id: paymentId,
                status: "PROCESSING"
            },
            {
                $set: {
                    status: "PENDING",

                    paymentStatus:
                        "PENDING",

                    lastVerificationError:
                        transaction.gateway_response ||
                        `Payment is ${transactionStatus}.`,

                    lastVerificationAttemptAt:
                        new Date(),

                    processingStartedAt:
                        null
                }
            }
        );

        return await Payment.findById(
            paymentId
        );
    }

    /*
    ============================================================
    STEP 6
    TERMINAL FAILED PAYMENT

    Only permanently fail the payment when
    Paystack has a terminal failure status.
    ============================================================
    */

    const failedStatuses = [
        "failed",
        "abandoned",
        "reversed",
        "cancelled"
    ];

    if (
        failedStatuses.includes(
            transactionStatus
        )
    ) {

        const failureReason =
            transaction.gateway_response ||
            transaction.message ||
            `Payment ${transactionStatus}.`;

        await Payment.updateOne(
            {
                _id: paymentId,
                status: "PROCESSING"
            },
            {
                $set: {
                    status: "FAILED",

                    paymentStatus:
                        "FAILED",

                    failureReason,

                    lastVerificationError:
                        failureReason,

                    lastVerificationAttemptAt:
                        new Date(),

                    processingStartedAt:
                        null
                }
            }
        );

        throw new Error(
            failureReason
        );
    }

    /*
    ============================================================
    STEP 7
    PAYMENT MUST BE SUCCESSFUL
    ============================================================
    */

    if (
        transactionStatus !==
        "success"
    ) {

        /*
        Unknown status.

        Safer to retry instead of permanently
        marking the payment as failed.
        */

        await Payment.updateOne(
            {
                _id: paymentId,
                status: "PROCESSING"
            },
            {
                $set: {
                    status: "PENDING",

                    paymentStatus:
                        "PENDING",

                    lastVerificationError:
                        `Unknown Paystack transaction status: ${transactionStatus}`,

                    lastVerificationAttemptAt:
                        new Date(),

                    processingStartedAt:
                        null
                }
            }
        );

        throw new Error(
            `Unknown Paystack transaction status: ${transactionStatus}`
        );
    }

    /*
    ============================================================
    STEP 8
    VALIDATE CURRENCY
    ============================================================
    */

    if (
        transaction.currency !==
        payment.currency
    ) {

        await Payment.updateOne(
            {
                _id: paymentId,
                status: "PROCESSING"
            },
            {
                $set: {
                    status: "FAILED",

                    paymentStatus:
                        "FAILED",

                    failureReason:
                        "Currency mismatch.",

                    lastVerificationAttemptAt:
                        new Date(),

                    processingStartedAt:
                        null
                }
            }
        );

        throw new Error(
            "Currency mismatch."
        );
    }

    /*
    ============================================================
    STEP 9
    VALIDATE AMOUNT
    ============================================================
    */

    if (
        Number(transaction.amount) <
        Number(payment.amount)
    ) {

        await Payment.updateOne(
            {
                _id: paymentId,
                status: "PROCESSING"
            },
            {
                $set: {
                    status: "FAILED",

                    paymentStatus:
                        "FAILED",

                    failureReason:
                        "Incorrect payment amount.",

                    lastVerificationAttemptAt:
                        new Date(),

                    processingStartedAt:
                        null
                }
            }
        );

        throw new Error(
            "Incorrect payment amount."
        );
    }

    /*
    ============================================================
    STEP 10
    CALCULATE PAYMENT AMOUNTS
    ============================================================
    */

    const paidAmount =
        Number(
            transaction.amount
        );

    const gatewayFee =
        Number(
            transaction.fees || 0
        );

    const creditAmount =
        Math.max(
            paidAmount -
            gatewayFee,
            0
        );

    /*
    ============================================================
    STEP 11
    START MONGODB TRANSACTION

    Paystack API call is already complete.
    ============================================================
    */

    const session =
        await mongoose.startSession();

    try {

        await session.withTransaction(
            async () => {

                /*
                ====================================================
                RELOAD PAYMENT
                ====================================================
                */

                const lockedPayment =
                    await Payment.findOne(
                        {
                            _id: paymentId,
                            status: "PROCESSING"
                        }
                    ).session(session);

                if (!lockedPayment) {

                    const currentPayment =
                        await Payment.findById(
                            paymentId
                        ).session(session);

                    if (
                        currentPayment?.status ===
                        "SUCCESS"
                    ) {
                        return;
                    }

                    throw new Error(
                        "Payment is no longer available for processing."
                    );
                }

                /*
                ====================================================
                FIND ORDER
                ====================================================
                */

                const order =
                    await PropertyOrder.findById(
                        lockedPayment.order
                    ).session(session);

                if (!order) {
                    throw new Error(
                        "Order not found."
                    );
                }

                /*
                ====================================================
                FIND PROPERTY
                ====================================================
                */

                const property =
                    await Propert.findById(
                        lockedPayment.property
                    ).session(session);

                if (!property) {
                    throw new Error(
                        "Property not found."
                    );
                }

                /*
                ====================================================
                CALCULATE REMAINING ESCROW
                ====================================================
                */

                const remainingBefore =
                    Math.max(
                        Number(
                            order.totalAmount ||
                            0
                        ) -
                        Number(
                            order.escrowAmount ||
                            0
                        ),
                        0
                    );

                const escrowCredit =
                    Math.min(
                        creditAmount,
                        remainingBefore
                    );

                /*
                ====================================================
                UPDATE PAYMENT
                ====================================================
                */

                lockedPayment.status =
                    "SUCCESS";

                lockedPayment.paymentStatus =
                    "PAID";

                lockedPayment.TransactionId =
                    transaction.id;

                lockedPayment.gatewayResponse =
                    transaction.gateway_response;

                lockedPayment.channel =
                    transaction.channel;

                lockedPayment.authorizationCode =
                    transaction.authorization
                        ?.authorization_code ||
                    null;

                lockedPayment.paidAmount =
                    paidAmount;

                lockedPayment.gatewayFee =
                    gatewayFee;

                lockedPayment.creditAmount =
                    creditAmount;

                lockedPayment.paidAt =
                    transaction.paid_at ||
                    new Date();

                lockedPayment.lastVerificationAttemptAt =
                    new Date();

                lockedPayment.processingStartedAt =
                    null;

                await lockedPayment.save({
                    session
                });

                /*
                ====================================================
                UPDATE PROPERTY
                ====================================================
                */

                /*
                Only put property off_market when
                the order is fully funded.

                If your business rule is that the property
                becomes unavailable after the first payment,
                move this outside the FULLY_PAID condition.
                */

                /*
                ====================================================
                CREDIT PLATFORM WALLET
                ====================================================
                */

                await WalletService.creditPlatformWallet({
                    payment:
                        lockedPayment,

                    order,

                    amount:
                        creditAmount,

                    transaction,

                    session
                });

                /*
                ====================================================
                UPDATE ORDER ESCROW
                ====================================================
                */

                order.escrowAmount =
                    Number(
                        order.escrowAmount ||
                        0
                    ) +
                    escrowCredit;

                order.remainingAmount =
                    Math.max(
                        Number(
                            order.totalAmount ||
                            0
                        ) -
                        order.escrowAmount,
                        0
                    );

                /*
                ====================================================
                UPDATE ORDER STATUS
                ====================================================
                */

                if (
                    order.remainingAmount <=
                    0
                ) {

                    order.remainingAmount =
                        0;

                    order.escrowStatus =
                        "FUNDED";

                    order.orderStatus =
                        "PAID";

                    order.paymentStatus =
                        "FULLY_PAID";

                    /*
                    Property is now fully funded.
                    */

                    property.status =
                        "off_market";

                } else {

                    order.escrowStatus =
                        "PARTIALLY_FUNDED";

                    order.orderStatus =
                        "PENDING";

                    order.paymentStatus =
                        "PARTIALLY_PAID";
                }

                /*
                Save property only if changed.
                */

                await property.save({
                    session
                });

                /*
                Save order.
                */

                await order.save({
                    session
                });
            }
        );

        console.log(
            "Payment successfully processed:",
            txRef
        );

        return await Payment.findById(
            paymentId
        );

    } catch (error) {

        /*
        ============================================================
        TRANSACTION FAILED
        ============================================================

        IMPORTANT:

        If the MongoDB transaction failed, we return the
        payment to PENDING.

        This allows the 5-minute scheduler to retry.
        ============================================================
        */

        await Payment.updateOne(
            {
                _id: paymentId,
                status: "PROCESSING"
            },
            {
                $set: {
                    status: "PENDING",

                    paymentStatus:
                        "PENDING",

                    lastVerificationError:
                        error?.message ||
                        "Database transaction failed.",

                    lastVerificationAttemptAt:
                        new Date(),

                    processingStartedAt:
                        null
                }
            }
        );

        console.error(
            `Payment verification failed for ${txRef}:`,
            error
        );

        throw error;

    } finally {

        await session.endSession();
    }
}

    static async verifyAllPendingPayments() {
        console.log(
            "Starting pending payment verification..."
        );

        const pendingPayments =
            await Payment.find({
                status: "PENDING"
            }).select(
                "_id txRef status"
            );

        console.log(
            `Found ${pendingPayments.length} pending payments.`
        );

        const results = [];

        for (
            const payment of pendingPayments
        ) {

            console.log(
                `Verifying payment: ${payment.txRef}`
            );

            try {

                const verifiedPayment =
                    await this.verifyOrderPayment(
                        payment.txRef
                    );

                results.push({
                    txRef:
                        payment.txRef,

                    success:
                        verifiedPayment?.status ===
                        "SUCCESS",

                    status:
                        verifiedPayment?.status
                });

            } catch (error) {

                console.error(
                    `Failed to verify ${payment.txRef}:`,
                    error.message
                );

                results.push({
                    txRef:
                        payment.txRef,

                    success:
                        false,

                    status:
                        "FAILED",

                    error:
                        error.message
                });
            }
        }

        return {
            total:
                pendingPayments.length,

            successful:
                results.filter(
                    x => x.success
                ).length,

            failed:
                results.filter(
                    x => !x.success
                ).length,

            results
        };
    }

    static async verifyPendingPaymentsJob() {
        try {
            console.log(
                `[${new Date().toISOString()}] Starting pending payment verification...`
            );

            const result =
                await PaymentService.verifyAllPendingPayments();

            console.log(
                `[${new Date().toISOString()}] Pending payment verification completed.`,
                {
                    total: result?.total || 0,
                    successful: result?.successful || 0,
                    failed: result?.failed || 0
                }
            );

            return result;

        } catch (error) {

            console.error(
                "Internal pending payment verification failed:",
                error
            );

            // IMPORTANT:
            // Do not throw here if this is a background job.
            // Otherwise the scheduler may report an unhandled error.

            return {
                success: false,
                message:
                    error?.message ||
                    "Pending payment verification failed.",

                total: 0,
                successful: 0,
                failed: 0,
                results: []
            };
        }
    }

}

export default PaymentService;