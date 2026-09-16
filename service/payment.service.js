/*
|--------------------------------------------------------------------------
| Payment Service
|--------------------------------------------------------------------------
| Handles:
| - Student payments
| - Paystack payments
| - Flutterwave payments
| - Payment verification
| - Commission calculation
| - Teacher commission
| - Admin commission
| - Platform share
| - Wallet settlement
| - Idempotent settlement
| - Pending payment verification
| - Refund validation
|
| IMPORTANT:
| All internal monetary calculations are performed in KOBO.
|
| Commission rules:
|
| 1. Teacher + Admin
|    Teacher = teacher commission %
|    Admin   = admin commission %
|    Platform = remainder
|
| 2. Admin only
|    Admin = teacher commission %
|    Platform = remainder
|    Admin's normal admin commission is NOT added.
|
| 3. Teacher only
|    Teacher = teacher commission %
|    Platform = remainder
|
| 4. No Teacher + No Admin
|    Platform = 100%
|
|--------------------------------------------------------------------------
*/

import mongoose from "mongoose";

import Payment from "../models/Payment.js";
import Usercbt from "../models/Users.js";

import FlutterwaveService from "./flutterwave.service.js";
import PaystackService from "./paystack.service.js";
import WalletService from "./wallet.service.js";


class PaymentService {
  /*
  |--------------------------------------------------------------------------
  | Default Commission Percentages
  |--------------------------------------------------------------------------
  */

  static DEFAULT_TEACHER_PERCENTAGE = 17.5;
  static DEFAULT_ADMIN_PERCENTAGE = 7.5;

  static PAYMENT_STATUS = {
    CREATED: "CREATED",
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    REFUNDED: "REFUNDED",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  };

  /*
  |--------------------------------------------------------------------------
  | Generate Transaction Reference
  |--------------------------------------------------------------------------
  */

  static generateTxRef(prefix = "CBT") {
    const timestamp = Date.now();
    const random = Math.random()
      .toString(36)
      .substring(2, 10)
      .toUpperCase();

    return `${prefix}-${timestamp}-${random}`;
  }

  /*
  |--------------------------------------------------------------------------
  | Convert Naira -> Kobo
  |--------------------------------------------------------------------------
  */

  static toKobo(amount) {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
      throw new Error("Invalid payment amount");
    }

    if (numericAmount <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }

    return Math.round(numericAmount * 100);
  }

  /*
  |--------------------------------------------------------------------------
  | Convert Kobo -> Naira
  |--------------------------------------------------------------------------
  */

  static fromKobo(amount) {
    const numericAmount = Number(amount || 0);

    if (!Number.isFinite(numericAmount)) {
      return 0;
    }

    return numericAmount / 100;
  }

  /*
  |--------------------------------------------------------------------------
  | Normalize Currency
  |--------------------------------------------------------------------------
  */

  static normalizeCurrency(currency) {
    return String(currency || "NGN")
      .trim()
      .toUpperCase();
  }

  /*
  |--------------------------------------------------------------------------
  | Normalize Gateway
  |--------------------------------------------------------------------------
  */

  static normalizeGateway(gateway) {
    const value = String(gateway || "")
      .trim()
      .toUpperCase();

    if (!["PAYSTACK", "FLUTTERWAVE"].includes(value)) {
      throw new Error(
        "Invalid payment gateway. Use PAYSTACK or FLUTTERWAVE."
      );
    }

    return value;
  }

  /*
  |--------------------------------------------------------------------------
  | Normalize Payment Method
  |--------------------------------------------------------------------------
  */

  static normalizePaymentMethod(paymentMethod) {
    const value = String(paymentMethod || "UNKNOWN")
      .trim()
      .toUpperCase();

    const allowed = [
      "CARD",
      "BANK_TRANSFER",
      "USSD",
      "ACCOUNT",
      "QR",
      "MOBILE_MONEY",
      "UNKNOWN",
    ];

    return allowed.includes(value) ? value : "UNKNOWN";
  }

  /*
  |--------------------------------------------------------------------------
  | Get User
  |--------------------------------------------------------------------------
  */

  static async getUser(userId, session = null) {
    if (!userId) {
      return null;
    }

    const query = Usercbt.findById(userId);

    if (session) {
      query.session(session);
    }

    return query;
  }

  /*
  |--------------------------------------------------------------------------
  | Resolve Teacher
  |--------------------------------------------------------------------------
  |
  | A student is allowed to have NO teacher.
  |
  */

  static async resolveTeacher(student, session = null) {
    if (!student) {
      return null;
    }

    if (!student.teacherOwner) {
      return null;
    }

    const teacher = await this.getUser(
      student.teacherOwner,
      session
    );

    if (!teacher) {
      return null;
    }

    if (teacher.role !== "teacher") {
      return null;
    }

    return teacher;
  }

  /*
  |--------------------------------------------------------------------------
  | Resolve Admin
  |--------------------------------------------------------------------------
  |
  | Priority:
  |
  | 1. Student adminOwner
  | 2. Teacher adminOwner
  |
  | Admin is allowed to be null.
  |
  */

  static async resolveAdmin(
    student,
    teacher = null,
    session = null
  ) {
    const adminId =
      student?.adminOwner ||
      teacher?.adminOwner ||
      null;

    if (!adminId) {
      return null;
    }

    const admin = await this.getUser(
      adminId,
      session
    );

    if (!admin) {
      return null;
    }

    if (!["admin", "superadmin"].includes(admin.role)) {
      return null;
    }

    return admin;
  }

  /*
  |--------------------------------------------------------------------------
  | Get User Commission Percentage
  |--------------------------------------------------------------------------
  */

  static getCommissionPercentage(
    user,
    fallbackPercentage
  ) {
    if (
      user &&
      user.commissionPercentage !== undefined &&
      user.commissionPercentage !== null
    ) {
      const percentage = Number(
        user.commissionPercentage
      );

      if (
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 100
      ) {
        throw new Error(
          `Invalid commissionPercentage for user ${user._id}`
        );
      }

      return percentage;
    }

    return Number(fallbackPercentage);
  }

  /*
  |--------------------------------------------------------------------------
  | Calculate Commission Split
  |--------------------------------------------------------------------------
  |
  | Example:
  |
  | Student pays ₦4,000
  |
  | Teacher + Admin:
  |
  | Teacher 17.5% = ₦700
  | Admin    7.5% = ₦300
  | Platform 75%   = ₦3,000
  |
  |
  | Admin only:
  |
  | Admin    17.5% = ₦700
  | Platform 82.5% = ₦3,300
  |
  |
  | Teacher only:
  |
  | Teacher 17.5% = ₦700
  | Platform 82.5% = ₦3,300
  |
  |
  | Neither:
  |
  | Platform 100% = ₦4,000
  |
  |--------------------------------------------------------------------------
  */

  static calculateCommissionSplit({
    totalPaid,
    teacher = null,
    admin = null,
  }) {
    const amount = Number(totalPaid);

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(
        "totalPaid must be a positive integer amount in Kobo"
      );
    }

    const teacherCommissionPercentage =
      this.getCommissionPercentage(
        teacher,
        this.DEFAULT_TEACHER_PERCENTAGE
      );

    const adminCommissionPercentage =
      this.getCommissionPercentage(
        admin,
        this.DEFAULT_ADMIN_PERCENTAGE
      );

    let teacherPercentage = 0;
    let adminPercentage = 0;

    /*
    |--------------------------------------------------------------------------
    | Teacher + Admin
    |--------------------------------------------------------------------------
    */

    if (teacher && admin) {
      teacherPercentage =
        teacherCommissionPercentage;

      adminPercentage =
        adminCommissionPercentage;
    }

    /*
    |--------------------------------------------------------------------------
    | Admin only
    |--------------------------------------------------------------------------
    |
    | Admin receives the TEACHER commission.
    |
    | Admin's normal 7.5% commission does not stack.
    |
    */

    else if (!teacher && admin) {
      teacherPercentage = 0;

      adminPercentage =
        teacherCommissionPercentage;
    }

    /*
    |--------------------------------------------------------------------------
    | Teacher only
    |--------------------------------------------------------------------------
    */

    else if (teacher && !admin) {
      teacherPercentage =
        teacherCommissionPercentage;

      adminPercentage = 0;
    }

    /*
    |--------------------------------------------------------------------------
    | Neither Teacher nor Admin
    |--------------------------------------------------------------------------
    */

    else {
      teacherPercentage = 0;
      adminPercentage = 0;
    }

    /*
    |--------------------------------------------------------------------------
    | Calculate Amounts
    |--------------------------------------------------------------------------
    */

    const teacherAmount = Math.floor(
      amount * (teacherPercentage / 100)
    );

    const adminAmount = Math.floor(
      amount * (adminPercentage / 100)
    );

    const platformAmount =
      amount -
      teacherAmount -
      adminAmount;

    if (platformAmount < 0) {
      throw new Error(
        "Invalid commission configuration: commissions exceed payment amount"
      );
    }

    return {
      totalPaid: amount,

      teacherPercentage,
      adminPercentage,

      teacherAmount,
      adminAmount,

      platformPercentage:
        100 -
        teacherPercentage -
        adminPercentage,

      platformAmount,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Create Student Payment
  |--------------------------------------------------------------------------
  */

  static async createStudentPayment({
    studentId,
    amount,
    gateway,
    paymentMethod = "UNKNOWN",
    subscriptionType = null,
    metadata = {},
    ipAddress = null,
    device = null,
  }) {
    if (!studentId) {
      throw new Error("studentId is required");
    }

    /*
    |--------------------------------------------------------------------------
    | Student
    |--------------------------------------------------------------------------
    */

    const student = await this.getUser(studentId);

    if (!student) {
      throw new Error("Student not found");
    }

    if (student.role !== "student") {
      throw new Error(
        "Only student accounts can create student payments"
      );
    }

    if (student.status !== "Active") {
      throw new Error(
        "Student account is not active"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Amount
    |--------------------------------------------------------------------------
    */

    const amountKobo = this.toKobo(amount);

    /*
    |--------------------------------------------------------------------------
    | Gateway
    |--------------------------------------------------------------------------
    */

    const normalizedGateway =
      this.normalizeGateway(gateway);

    const normalizedPaymentMethod =
      this.normalizePaymentMethod(paymentMethod);

    const currency = "NGN";

    /*
    |--------------------------------------------------------------------------
    | Transaction Reference
    |--------------------------------------------------------------------------
    */

    const txRef =
      this.generateTxRef("CBT");

    /*
    |--------------------------------------------------------------------------
    | Initialize Gateway
    |--------------------------------------------------------------------------
    */

    let gatewayResponse;

    if (normalizedGateway === "PAYSTACK") {
      gatewayResponse =
        await PaystackService.initializePayment({
          email: student.email,
          amount: amountKobo,
          currency,
          reference: txRef,
          metadata: {
            studentId: String(student._id),
            txRef,
            paymentType: "STUDENT_PAYMENT",
            ...metadata,
          },
        });
    }

    if (normalizedGateway === "FLUTTERWAVE") {
      gatewayResponse =
        await FlutterwaveService.initializePayment({
          email: student.email,
          amount: this.fromKobo(amountKobo),
          currency,
          txRef,
          paymentMethod:
            normalizedPaymentMethod,
          metadata: {
            studentId: String(student._id),
            txRef,
            paymentType: "STUDENT_PAYMENT",
            ...metadata,
          },
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Save Payment
    |--------------------------------------------------------------------------
    */

    const payment = await Payment.create({
      txRef,

      gateway: normalizedGateway,

      gatewayReference:
        gatewayResponse?.reference ||
        gatewayResponse?.transaction_id ||
        gatewayResponse?.id ||
        null,

      TransactionId:
        gatewayResponse?.transaction_id ||
        null,

      payer: student._id,

      amount: amountKobo,

      currency,

      gatewayFee: 0,

      creditAmount: 0,

      paymentMethod:
        normalizedPaymentMethod,

      subscriptionType,

      status:
        this.PAYMENT_STATUS.PENDING,

      verified: false,

      webhookReceived: false,

      webhookProcessed: false,

      gatewayResponse,

      metadata: {
        paymentType: "STUDENT_PAYMENT",

        studentId: String(student._id),

        ...metadata,
      },

      ipAddress,

      device,
    });

    return {
      success: true,

      payment,

      txRef,

      gateway: normalizedGateway,

      amount: amountKobo,

      amountNaira:
        this.fromKobo(amountKobo),

      authorizationUrl:
        gatewayResponse?.authorization_url ||
        gatewayResponse?.payment_link ||
        gatewayResponse?.link ||
        null,

      gatewayResponse,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Verify Paystack
  |--------------------------------------------------------------------------
  */

  static async verifyPaystack(txRef) {
    if (!txRef) {
      throw new Error(
        "Transaction reference is required"
      );
    }

    return PaystackService.verifyPayment(
      txRef
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Verify Flutterwave
  |--------------------------------------------------------------------------
  */

  static async verifyFlutterwave(txRef) {
    if (!txRef) {
      throw new Error(
        "Transaction reference is required"
      );
    }

    return FlutterwaveService.verifyPayment(
      txRef
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Gateway Status
  |--------------------------------------------------------------------------
  */

  static getGatewayStatus(response) {
    if (!response) {
      return "UNKNOWN";
    }

    const status =
      response.status ||
      response.data?.status ||
      response.data?.data?.status ||
      "";

    return String(status)
      .trim()
      .toLowerCase();
  }

  /*
  |--------------------------------------------------------------------------
  | Gateway Amount
  |--------------------------------------------------------------------------
  */

  static getGatewayAmount(
    response,
    gateway
  ) {
    if (!response) {
      return 0;
    }

    const value =
      response.amount ??
      response.data?.amount ??
      response.data?.data?.amount ??
      0;

    const numericValue =
      Number(value);

    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    /*
    |--------------------------------------------------------------------------
    | Paystack
    |--------------------------------------------------------------------------
    |
    | Paystack amount is normally Kobo.
    |
    */

    if (gateway === "PAYSTACK") {
      return Math.round(numericValue);
    }

    /*
    |--------------------------------------------------------------------------
    | Flutterwave
    |--------------------------------------------------------------------------
    |
    | Flutterwave responses commonly return NGN.
    |
    */

    return this.toKobo(numericValue);
  }

  /*
  |--------------------------------------------------------------------------
  | Gateway Fee
  |--------------------------------------------------------------------------
  */

  static getGatewayFee(
    response,
    gateway
  ) {
    if (!response) {
      return 0;
    }

    const fee =
      response.fee ??
      response.charged_fee ??
      response.data?.fee ??
      response.data?.data?.fee ??
      0;

    const numericFee =
      Number(fee);

    if (
      !Number.isFinite(numericFee) ||
      numericFee < 0
    ) {
      return 0;
    }

    /*
    |--------------------------------------------------------------------------
    | Paystack
    |--------------------------------------------------------------------------
    */

    if (gateway === "PAYSTACK") {
      return Math.round(numericFee);
    }

    /*
    |--------------------------------------------------------------------------
    | Flutterwave
    |--------------------------------------------------------------------------
    */

    return Math.round(
      numericFee * 100
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Verify Student Payment
  |--------------------------------------------------------------------------
  */

  static async verifyStudentPayment(
    txRef
  ) {
    if (!txRef) {
      throw new Error(
        "Transaction reference is required"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Step 1
    |--------------------------------------------------------------------------
    | Atomically claim PENDING payment.
    |
    | This prevents two requests from settling
    | the same payment simultaneously.
    |--------------------------------------------------------------------------
    */

    const claimedPayment =
      await Payment.findOneAndUpdate(
        {
          txRef,

          status:
            this.PAYMENT_STATUS.PENDING,

          verified: false,
        },

        {
          $set: {
            status:
              this.PAYMENT_STATUS.PROCESSING,
          },
        },

        {
          new: true,
        }
      );

    /*
    |--------------------------------------------------------------------------
    | Already Processing / Already Successful
    |--------------------------------------------------------------------------
    */

    if (!claimedPayment) {
      const existingPayment =
        await Payment.findOne({
          txRef,
        });

      if (!existingPayment) {
        throw new Error(
          "Payment not found"
        );
      }

      if (
        existingPayment.status ===
        this.PAYMENT_STATUS.SUCCESS
      ) {
        return {
          success: true,
          alreadyProcessed: true,
          payment: existingPayment,
        };
      }

      if (
        existingPayment.status ===
        this.PAYMENT_STATUS.PROCESSING
      ) {
        return {
          success: false,
          processing: true,
          message:
            "Payment is currently being processed",
          payment: existingPayment,
        };
      }

      throw new Error(
        `Payment cannot be verified from status ${existingPayment.status}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Verify With Gateway
    |--------------------------------------------------------------------------
    */

    let gatewayResponse;

    try {
      if (
        claimedPayment.gateway ===
        "PAYSTACK"
      ) {
        gatewayResponse =
          await this.verifyPaystack(
            txRef
          );
      }

      else if (
        claimedPayment.gateway ===
        "FLUTTERWAVE"
      ) {
        gatewayResponse =
          await this.verifyFlutterwave(
            txRef
          );
      }

      else {
        throw new Error(
          `Unsupported gateway ${claimedPayment.gateway}`
        );
      }
    }

    catch (error) {
      await Payment.updateOne(
        {
          _id: claimedPayment._id,

          status:
            this.PAYMENT_STATUS.PROCESSING,
        },

        {
          $set: {
            status:
              this.PAYMENT_STATUS.PENDING,

            failureReason:
              error.message,
          },
        }
      );

      throw error;
    }

    /*
    |--------------------------------------------------------------------------
    | Gateway Status
    |--------------------------------------------------------------------------
    */

    const gatewayStatus =
      this.getGatewayStatus(
        gatewayResponse
      );

    /*
    |--------------------------------------------------------------------------
    | Pending Gateway Payment
    |--------------------------------------------------------------------------
    */

    const successfulStatuses = [
      "success",
      "successful",
      "completed",
      "paid",
    ];

    const failedStatuses = [
      "failed",
      "cancelled",
      "canceled",
      "declined",
      "expired",
    ];

    if (
      !successfulStatuses.includes(
        gatewayStatus
      )
    ) {
      if (
        failedStatuses.includes(
          gatewayStatus
        )
      ) {
        const failedPayment =
          await Payment.findOneAndUpdate(
            {
              _id: claimedPayment._id,

              status:
                this.PAYMENT_STATUS.PROCESSING,
            },

            {
              $set: {
                status:
                  this.PAYMENT_STATUS.FAILED,

                gatewayResponse,

                failureReason:
                  `Gateway returned status: ${gatewayStatus}`,
              },
            },

            {
              new: true,
            }
          );

        return {
          success: false,
          payment: failedPayment,
          gatewayStatus,
        };
      }

      /*
      |--------------------------------------------------------------------------
      | Still Pending
      |--------------------------------------------------------------------------
      */

      const pendingPayment =
        await Payment.findOneAndUpdate(
          {
            _id: claimedPayment._id,

            status:
              this.PAYMENT_STATUS.PROCESSING,
          },

          {
            $set: {
              status:
                this.PAYMENT_STATUS.PENDING,

              gatewayResponse,
            },
          },

          {
            new: true,
          }
        );

      return {
        success: false,

        pending: true,

        message:
          "Payment has not been completed yet",

        payment: pendingPayment,

        gatewayStatus,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Gateway Amount
    |--------------------------------------------------------------------------
    */

    const gatewayAmount =
      this.getGatewayAmount(
        gatewayResponse,
        claimedPayment.gateway
      );

    const expectedAmount =
      Number(
        claimedPayment.amount
      );

    /*
    |--------------------------------------------------------------------------
    | Protect Against Underpayment
    |--------------------------------------------------------------------------
    */

    if (
      gatewayAmount < expectedAmount
    ) {
      const underpaidPayment =
        await Payment.findOneAndUpdate(
          {
            _id: claimedPayment._id,

            status:
              this.PAYMENT_STATUS.PROCESSING,
          },

          {
            $set: {
              status:
                this.PAYMENT_STATUS.FAILED,

              gatewayResponse,

              failureReason:
                `Underpayment detected. Expected ${expectedAmount} Kobo but gateway reported ${gatewayAmount} Kobo.`,
            },
          },

          {
            new: true,
          }
        );

      return {
        success: false,

        payment:
          underpaidPayment,

        error:
          "Payment amount is less than the expected amount",
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Gateway Fee
    |--------------------------------------------------------------------------
    */

    const gatewayFee =
      this.getGatewayFee(
        gatewayResponse,
        claimedPayment.gateway
      );

    /*
    |--------------------------------------------------------------------------
    | Start Database Transaction
    |--------------------------------------------------------------------------
    */

    const session =
      await mongoose.startSession();

    try {
      let settledPayment = null;

      await session.withTransaction(
        async () => {
          /*
          |--------------------------------------------------------------------------
          | Reload Payment
          |--------------------------------------------------------------------------
          */

          const payment =
            await Payment.findOne({
              _id: claimedPayment._id,

              status:
                this.PAYMENT_STATUS.PROCESSING,
            }).session(session);

          if (!payment) {
            throw new Error(
              "Payment is no longer available for settlement"
            );
          }

          /*
          |--------------------------------------------------------------------------
          | If already verified
          |--------------------------------------------------------------------------
          */

          if (payment.verified) {
            settledPayment =
              payment;

            return;
          }

          /*
          |--------------------------------------------------------------------------
          | Get Student
          |--------------------------------------------------------------------------
          */

          const student =
            await Usercbt.findById(
              payment.payer
            ).session(session);

          if (!student) {
            throw new Error(
              "Student account not found"
            );
          }

          /*
          |--------------------------------------------------------------------------
          | Resolve Teacher
          |--------------------------------------------------------------------------
          */

          const teacher =
            await this.resolveTeacher(
              student,
              session
            );

          /*
          |--------------------------------------------------------------------------
          | Resolve Admin
          |--------------------------------------------------------------------------
          */

          const admin =
            await this.resolveAdmin(
              student,
              teacher,
              session
            );

          /*
          |--------------------------------------------------------------------------
          | Calculate Split
          |--------------------------------------------------------------------------
          */

          const split =
            this.calculateCommissionSplit({
              totalPaid:
                expectedAmount,

              teacher,

              admin,
            });

          /*
          |--------------------------------------------------------------------------
          | Platform Net
          |--------------------------------------------------------------------------
          |
          | Gateway fee is absorbed by platform.
          |
          | Example:
          |
          | Platform gross = ₦3,000
          | Gateway fee    = ₦100
          | Platform net   = ₦2,900
          |
          |--------------------------------------------------------------------------
          */

          const platformNetAmount =
            Math.max(
              split.platformAmount -
                gatewayFee,
              0
            );

          /*
          |--------------------------------------------------------------------------
          | Update Payment
          |--------------------------------------------------------------------------
          */

          payment.status =
            this.PAYMENT_STATUS.SUCCESS;

          payment.verified = true;

          payment.verificationDate =
            new Date();

          payment.paidAt =
            new Date();

          payment.gatewayFee =
            gatewayFee;

          payment.creditAmount =
            expectedAmount;

          payment.gatewayResponse =
            gatewayResponse;

          payment.failureReason =
            null;

          payment.metadata = {
            ...(payment.metadata || {}),

            settlement: {
              teacherId:
                teacher?._id ||
                null,

              adminId:
                admin?._id ||
                null,

              totalPaid:
                split.totalPaid,

              teacherPercentage:
                split.teacherPercentage,

              adminPercentage:
                split.adminPercentage,

              platformPercentage:
                split.platformPercentage,

              teacherAmount:
                split.teacherAmount,

              adminAmount:
                split.adminAmount,

              platformGrossAmount:
                split.platformAmount,

              gatewayFee,

              platformNetAmount,
            },
          };

          await payment.save({
            session,
          });

          /*
          |--------------------------------------------------------------------------
          | Teacher Wallet
          |--------------------------------------------------------------------------
          */

          if (
            teacher &&
            split.teacherAmount > 0
          ) {
            await WalletService.creditTeacherWallet({
              teacherId:
                teacher._id,

              payment,

              amount:
                split.teacherAmount,

              session,

              metadata: {
                studentId:
                  student._id,

                teacherId:
                  teacher._id,

                adminId:
                  admin?._id ||
                  null,

                totalPaid:
                  split.totalPaid,

                percentage:
                  split.teacherPercentage,

                amount:
                  split.teacherAmount,
              },
            });
          }

          /*
          |--------------------------------------------------------------------------
          | Admin Wallet
          |--------------------------------------------------------------------------
          */

          if (
            admin &&
            split.adminAmount > 0
          ) {
            await WalletService.creditAdminWallet({
              adminId:
                admin._id,

              payment,

              amount:
                split.adminAmount,

              session,

              metadata: {
                studentId:
                  student._id,

                teacherId:
                  teacher?._id ||
                  null,

                adminId:
                  admin._id,

                totalPaid:
                  split.totalPaid,

                percentage:
                  split.adminPercentage,

                amount:
                  split.adminAmount,
              },
            });
          }

          /*
          |--------------------------------------------------------------------------
          | Platform Wallet
          |--------------------------------------------------------------------------
          |
          | Credit platform's GROSS share first.
          |
          | Gateway fee is absorbed by platform.
          |
          | If WalletService has a platform fee debit method,
          | it should debit the gateway fee as a separate ledger
          | entry. This preserves transparent accounting.
          |--------------------------------------------------------------------------
          */

          if (
            split.platformAmount > 0
          ) {
            await WalletService.creditPlatformWallet({
              payment,

              amount:
                split.platformAmount,

              session,

              metadata: {
                studentId:
                  student._id,

                teacherId:
                  teacher?._id ||
                  null,

                adminId:
                  admin?._id ||
                  null,

                totalPaid:
                  split.totalPaid,

                percentage:
                  split.platformPercentage,

                grossAmount:
                  split.platformAmount,

                gatewayFee,

                netAmount:
                  platformNetAmount,
              },
            });
          }

          /*
          |--------------------------------------------------------------------------
          | Gateway Fee
          |--------------------------------------------------------------------------
          |
          | IMPORTANT:
          |
          | The gateway fee belongs to the platform.
          |
          | If your WalletService already has:
          |
          | debitPlatformWallet()
          |
          | you should debit gatewayFee here.
          |
          | This is intentionally conditional so the payment
          | service does not crash if the method does not yet exist.
          |--------------------------------------------------------------------------
          */

          if (
            gatewayFee > 0 &&
            typeof WalletService.debitPlatformWallet ===
              "function"
          ) {
            await WalletService.debitPlatformWallet({
              payment,

              amount:
                gatewayFee,

              session,

              metadata: {
                studentId:
                  student._id,

                teacherId:
                  teacher?._id ||
                  null,

                adminId:
                  admin?._id ||
                  null,

                paymentType:
                  "GATEWAY_FEE",

                description:
                  "Payment gateway fee absorbed by platform",

                gateway:
                  payment.gateway,
              },
            });
          }

          /*
          |--------------------------------------------------------------------------
          | Final Payment Object
          |--------------------------------------------------------------------------
          */

          settledPayment =
            payment;
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Return Settlement
      |--------------------------------------------------------------------------
      */

      return {
        success: true,

        message:
          "Payment verified and settled successfully",

        payment:
          settledPayment,

        settlement: {
          totalPaid:
            this.fromKobo(
              settledPayment.amount
            ),

          teacher: settledPayment.metadata
            ?.settlement?.teacherId
            ? {
                id:
                  settledPayment.metadata
                    .settlement
                    .teacherId,

                percentage:
                  settledPayment.metadata
                    .settlement
                    .teacherPercentage,

                amount:
                  this.fromKobo(
                    settledPayment.metadata
                      .settlement
                      .teacherAmount
                  ),
              }
            : null,

          admin: settledPayment.metadata
            ?.settlement?.adminId
            ? {
                id:
                  settledPayment.metadata
                    .settlement
                    .adminId,

                percentage:
                  settledPayment.metadata
                    .settlement
                    .adminPercentage,

                amount:
                  this.fromKobo(
                    settledPayment.metadata
                      .settlement
                      .adminAmount
                  ),
              }
            : null,

          platform: {
            percentage:
              settledPayment.metadata
                ?.settlement
                ?.platformPercentage,

            grossAmount:
              this.fromKobo(
                settledPayment.metadata
                  ?.settlement
                  ?.platformGrossAmount
              ),

            gatewayFee:
              this.fromKobo(
                settledPayment.metadata
                  ?.settlement
                  ?.gatewayFee
              ),

            netAmount:
              this.fromKobo(
                settledPayment.metadata
                  ?.settlement
                  ?.platformNetAmount
              ),
          },
        },
      };
    }

    catch (error) {
      /*
      |--------------------------------------------------------------------------
      | Reset Processing -> Pending
      |--------------------------------------------------------------------------
      |
      | If database settlement fails, allow the payment to
      | be retried safely.
      |--------------------------------------------------------------------------
      */

      await Payment.updateOne(
        {
          _id:
            claimedPayment._id,

          status:
            this.PAYMENT_STATUS.PROCESSING,

          verified: false,
        },

        {
          $set: {
            status:
              this.PAYMENT_STATUS.PENDING,

            failureReason:
              error.message,
          },
        }
      );

      throw error;
    }

    finally {
      await session.endSession();
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Get Payment
  |--------------------------------------------------------------------------
  */

  static async getPayment(txRef) {
    if (!txRef) {
      throw new Error(
        "Transaction reference is required"
      );
    }

    return Payment.findOne({
      txRef,
    }).populate(
      "payer",
      "firstName middleName lastName email phone role"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Get Payment Status
  |--------------------------------------------------------------------------
  */

  static async getPaymentStatus(txRef) {
    const payment =
      await Payment.findOne({
        txRef,
      }).select(
        "txRef status amount currency gateway verified paidAt gatewayFee creditAmount"
      );

    if (!payment) {
      throw new Error(
        "Payment not found"
      );
    }

    return {
      txRef:
        payment.txRef,

      status:
        payment.status,

      verified:
        payment.verified,

      amount:
        payment.amount,

      amountNaira:
        this.fromKobo(
          payment.amount
        ),

      currency:
        payment.currency,

      gateway:
        payment.gateway,

      gatewayFee:
        payment.gatewayFee,

      gatewayFeeNaira:
        this.fromKobo(
          payment.gatewayFee
        ),

      creditAmount:
        payment.creditAmount,

      creditAmountNaira:
        this.fromKobo(
          payment.creditAmount
        ),

      paidAt:
        payment.paidAt,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Verify All Pending Payments
  |--------------------------------------------------------------------------
  */

  static async verifyAllPendingPayments({
    limit = 50,
  } = {}) {
    const payments =
      await Payment.find({
        status:
          this.PAYMENT_STATUS.PENDING,

        verified: false,

        gateway: {
          $in: [
            "PAYSTACK",
            "FLUTTERWAVE",
          ],
        },
      })
        .sort({
          createdAt: 1,
        })
        .limit(Number(limit));

    const results = [];

    for (const payment of payments) {
      try {
        const result =
          await this.verifyStudentPayment(
            payment.txRef
          );

        results.push({
          txRef:
            payment.txRef,

          success:
            result.success,

          result,
        });
      }

      catch (error) {
        results.push({
          txRef:
            payment.txRef,

          success: false,

          error:
            error.message,
        });
      }
    }

    return {
      success: true,

      processed:
        results.length,

      results,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Pending Payments Job
  |--------------------------------------------------------------------------
  */

  static async verifyPendingPaymentsJob() {
    return this.verifyAllPendingPayments({
      limit: 50,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Validate Refund
  |--------------------------------------------------------------------------
  */

  static async validateRefund(
    txRef,
    refundAmount = null
  ) {
    if (!txRef) {
      throw new Error(
        "Transaction reference is required"
      );
    }

    const payment =
      await Payment.findOne({
        txRef,
      });

    if (!payment) {
      throw new Error(
        "Payment not found"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Payment must have succeeded
    |--------------------------------------------------------------------------
    */

    if (
      payment.status !==
      this.PAYMENT_STATUS.SUCCESS
    ) {
      throw new Error(
        "Only successful payments can be refunded"
      );
    }

    if (!payment.verified) {
      throw new Error(
        "Payment has not been verified"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Refund Amount
    |--------------------------------------------------------------------------
    */

    let requestedRefund;

    if (
      refundAmount === null ||
      refundAmount === undefined
    ) {
      requestedRefund =
        Number(payment.creditAmount);
    }

    else {
      requestedRefund =
        this.toKobo(
          refundAmount
        );
    }

    if (
      !Number.isInteger(
        requestedRefund
      ) ||
      requestedRefund <= 0
    ) {
      throw new Error(
        "Invalid refund amount"
      );
    }

    if (
      requestedRefund >
      Number(payment.creditAmount)
    ) {
      throw new Error(
        "Refund amount cannot exceed credited payment amount"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Existing Refund
    |--------------------------------------------------------------------------
    */

    if (
      payment.status ===
      this.PAYMENT_STATUS.REFUNDED
    ) {
      throw new Error(
        "Payment has already been fully refunded"
      );
    }

    return {
      valid: true,

      txRef:
        payment.txRef,

      paymentId:
        payment._id,

      refundAmount:
        requestedRefund,

      refundAmountNaira:
        this.fromKobo(
          requestedRefund
        ),

      originalAmount:
        payment.creditAmount,

      originalAmountNaira:
        this.fromKobo(
          payment.creditAmount
        ),
    };
  }
}


export default PaymentService;

