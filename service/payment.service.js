
import mongoose from "mongoose";

import Payment from "../model/Payment.js";
import Usercbt from "../model/Users.js";

import PaystackService from "./paystack.service.js";
import WalletService from "./wallet.service.js";
import { generateSoftwareTokenforuser } from "./softwareToken.service.js"

class PaymentService {

  /*
  |--------------------------------------------------------------------------
  | Commission Defaults
  |--------------------------------------------------------------------------
  */

  static DEFAULT_TEACHER_PERCENTAGE = 17.5;

  static DEFAULT_ADMIN_PERCENTAGE = 7.5;


  /*
  |--------------------------------------------------------------------------
  | Payment Status
  |--------------------------------------------------------------------------
  */

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

    return `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 10)
      .toUpperCase()}`;
  }


  /*
  |--------------------------------------------------------------------------
  | Naira -> Kobo
  |--------------------------------------------------------------------------
  */

  static toKobo(amount) {

    const value = Number(amount);

    if (!Number.isFinite(value)) {
      throw new Error("Invalid payment amount");
    }

    if (value <= 0) {
      throw new Error(
        "Payment amount must be greater than zero"
      );
    }

    return Math.round(value * 100);
  }


  /*
  |--------------------------------------------------------------------------
  | Kobo -> Naira
  |--------------------------------------------------------------------------
  */

  static fromKobo(amount) {

    const value = Number(amount || 0);

    if (!Number.isFinite(value)) {
      return 0;
    }

    return value / 100;
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
  */

  static async resolveTeacher(student, session = null) {

    if (!student?.teacherOwner) {
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
  | Commission Percentage
  |--------------------------------------------------------------------------
  */

static getCommissionPercentage(user, fallback) {
  const value = user?.commissionPercentage;

  // null, undefined, or 0 = use default
  if (
    value === undefined ||
    value === null ||
    Number(value) === 0
  ) {
    return Number(fallback);
  }

  const percentage = Number(value);

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


  /*
  |--------------------------------------------------------------------------
  | Calculate Commission
  |--------------------------------------------------------------------------
  */

  static calculateCommission({
    amount,
    teacher = null,
    admin = null,
    eligible = false,
  }) {

    const totalPaid = Number(amount);

    if (
      !Number.isInteger(totalPaid) ||
      totalPaid <= 0
    ) {
      throw new Error(
        "Commission amount must be a positive Kobo amount"
      );
    }


    /*
    |--------------------------------------------------------------------------
    | No Commission
    |--------------------------------------------------------------------------
    |
    | This is used when:
    |
    | - Student has already paid before
    | - Payer is not a student
    |--------------------------------------------------------------------------
    */

    if (!eligible) {
       console.log('it touch my body');
        
      return {
        totalPaid,

        teacherPercentage: 0,
        adminPercentage: 0,
        platformPercentage: 100,

        teacherAmount: 0,
        adminAmount: 0,

        platformAmount: totalPaid,
      };
    }


    /*
    |--------------------------------------------------------------------------
    | Percentages
    |--------------------------------------------------------------------------
    */

    const teacherPercentage =
      this.getCommissionPercentage(
        teacher,
        this.DEFAULT_TEACHER_PERCENTAGE
      );
      console.log(teacherPercentage,'teacherPercentageteacherPercentage');
      
    const adminPercentage =
      this.getCommissionPercentage(
        admin,
        this.DEFAULT_ADMIN_PERCENTAGE
      );


    let teacherPercent = 0;
    let adminPercent = 0;


    /*
    |--------------------------------------------------------------------------
    | Teacher + Admin
    |--------------------------------------------------------------------------
    */

    if (teacher && admin) {

      teacherPercent =
        teacherPercentage;

      adminPercent =
        adminPercentage;
    }


    /*
    |--------------------------------------------------------------------------
    | Admin Only
    |--------------------------------------------------------------------------
    |
    | Admin receives the teacher percentage.
    |
    */

    else if (!teacher && admin) {

      teacherPercent = 0;

      adminPercent =
        teacherPercentage;
    }


    /*
    |--------------------------------------------------------------------------
    | Teacher Only
    |--------------------------------------------------------------------------
    */

    else if (teacher && !admin) {

      teacherPercent =
        teacherPercentage;

      adminPercent = 0;
    }


    /*
    |--------------------------------------------------------------------------
    | Nobody
    |--------------------------------------------------------------------------
    */

    else {

      teacherPercent = 0;
      adminPercent = 0;
    }


    /*
    |--------------------------------------------------------------------------
    | Amounts
    |--------------------------------------------------------------------------
    */

    const teacherAmount =
      Math.floor(
        totalPaid *
        (teacherPercent / 100)
      );

    const adminAmount =
      Math.floor(
        totalPaid *
        (adminPercent / 100)
      );

    const platformAmount =
      totalPaid -
      teacherAmount -
      adminAmount;


    if (platformAmount < 0) {
      throw new Error(
        "Commission configuration exceeds payment amount"
      );
    }


    return {

      totalPaid,

      teacherPercentage:
        teacherPercent,

      adminPercentage:
        adminPercent,

      platformPercentage:
        100 -
        teacherPercent -
        adminPercent,

      teacherAmount,

      adminAmount,

      platformAmount,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | Check Whether Student Gets Commission
  |--------------------------------------------------------------------------
  |
  | A student receives commission distribution ONLY on their
  | first successful payment.
  |
  |--------------------------------------------------------------------------
  */

  static async isFirstStudentPayment(
    studentId,
    session = null
  ) {

    if (!studentId) {
      return false;
    }


    const query = Payment.findOne({
      payer: studentId,

      status:
        this.PAYMENT_STATUS.SUCCESS,

      verified: true,
    });


    if (session) {
      query.session(session);
    }


    const previousPayment =
      await query.select("_id");


    return !previousPayment;
  }


  /*
  |--------------------------------------------------------------------------
  | Initialize Payment
  |--------------------------------------------------------------------------
  |
  | GENERAL PAYMENT.
  |
  | Any active user can make a payment.
  |
  | paymentType can be supplied through metadata.
  |
  | Example:
  |
  | metadata: {
  |   paymentType: "PIN_PURCHASE"
  | }
  |
  |--------------------------------------------------------------------------
  */

  static async initializePayment({

    payerId,

    amount,

    metadata = {},

    paymentMethod = "UNKNOWN",

    ipAddress = null,

    device = null,

  }) {

    if (!payerId) {
      throw new Error("payerId is required");
    }


    /*
    |--------------------------------------------------------------------------
    | Get Payer
    |--------------------------------------------------------------------------
    */

    const payer =
      await this.getUser(payerId);


    if (!payer) {
      throw new Error("Payer not found");
    }


    /*
    |--------------------------------------------------------------------------
    | Optional Account Check
    |--------------------------------------------------------------------------
    */

    if (
      payer.status &&
      payer.status !== "Active"
    ) {
      throw new Error(
        "User account is not active"
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Amount
    |--------------------------------------------------------------------------
    */

    const amountKobo =
      this.toKobo(amount);


    /*
    |--------------------------------------------------------------------------
    | Reference
    |--------------------------------------------------------------------------
    */

    const txRef =
      this.generateTxRef("CBT");


    /*
    |--------------------------------------------------------------------------
    | Paystack
    |--------------------------------------------------------------------------
    */

    const gatewayResponse = await PaystackService.initializePayment({

      email: payer.email,

      amount: amountKobo,

      currency: "NGN",

      reference: txRef,

      metadata: {

        payerId:
          String(payer._id),

        payerRole:
          payer.role,

        txRef,

        paymentType:
          metadata.paymentType ||
          "PIN_PURCHASE",

        ...metadata,
      },
    });


    /*
    |--------------------------------------------------------------------------
    | Save Payment
    |--------------------------------------------------------------------------
    */

    const payment =
      await Payment.create({

        txRef,

        gateway:
          "PAYSTACK",

        gatewayReference:
          gatewayResponse?.reference ||
          null,

        TransactionId:
          gatewayResponse?.transaction_id ||
          null,

        payer:
          payer._id,

        amount:
          amountKobo,

        currency:
          "NGN",

        gatewayFee:
          0,

        creditAmount:
          0,

        paymentMethod,

        subscriptionType:
          metadata.subscriptionType ||
          null,

        status:
          this.PAYMENT_STATUS.PENDING,

        verified:
          false,

        webhookReceived:
          false,

        webhookProcessed:
          false,

        gatewayResponse,

        metadata: {

          ...metadata,

          paymentType:
            metadata.paymentType ||
            "PIN_PURCHASE",

          payerId:
            String(payer._id),

          payerRole:
            payer.role,

          txRef,
        },

        ipAddress,

        device,
      });


    /*
    |--------------------------------------------------------------------------
    | Return
    |--------------------------------------------------------------------------
    */

    return {

      success: true,
      email: payer.email,
      payment,

      txRef,

      gateway:
        "PAYSTACK",

      amount:
        amountKobo,

      amountNaira:
        this.fromKobo(amountKobo),

      authorizationUrl:
        gatewayResponse?.authorization_url ||
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
  | Gateway Status
  |--------------------------------------------------------------------------
  */

  static getGatewayStatus(response) {

    if (!response) {
      return "UNKNOWN";
    }

    const status = response.data?.status || response.data?.data?.status || "";

    return String(status)
      .trim()
      .toLowerCase();
  }


  /*
  |--------------------------------------------------------------------------
  | Gateway Amount
  |--------------------------------------------------------------------------
  |
  | Paystack returns Kobo.
  |
  |--------------------------------------------------------------------------
  */

  static getGatewayAmount(response) {

    if (!response) {
      return 0;
    }

    const value =
      response.amount ??
      response.data?.amount ??
      response.data?.data?.amount ??
      0;

    const amount =
      Number(value);

    if (!Number.isFinite(amount)) {
      return 0;
    }

    return Math.round(amount);
  }


  /*
  |--------------------------------------------------------------------------
  | Gateway Fee
  |--------------------------------------------------------------------------
  |
  | Paystack fee is stored as Kobo.
  |
  |--------------------------------------------------------------------------
  */

  static getGatewayFee(response) {

    if (!response) {
      return 0;
    }


    const fee = response.data.fees




    const amount =
      Number(fee);

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      return 0;
    }


    return Math.round(amount);
  }


  /*
  |--------------------------------------------------------------------------
  | Verify Payment
  |--------------------------------------------------------------------------
  |
  | GENERAL PAYMENT VERIFICATION.
  |
  |--------------------------------------------------------------------------
  */

  static async verifyPayment(txRef) {

    if (!txRef) {
      throw new Error(
        "Transaction reference is required"
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Claim Payment
    |--------------------------------------------------------------------------
    |
    | Only PENDING payment can be claimed.
    |
    | This protects against double settlement.
    |
    |--------------------------------------------------------------------------
    */

    const claimedPayment = await Payment.findOneAndUpdate(

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
    | Already Processing / Successful
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

          payment:
            existingPayment,
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

          payment:
            existingPayment,
        };
      }


      throw new Error(
        `Payment cannot be verified from status ${existingPayment.status}`
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Verify With Paystack
    |--------------------------------------------------------------------------
    */

    let gatewayResponse;

    try {

      gatewayResponse =
        await this.verifyPaystack(
          txRef
        );
      console.log(gatewayResponse, 'ffffffffff');


    }

    catch (error) {

      await Payment.updateOne(

        {
          _id:
            claimedPayment._id,

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
      "abandoned",
      "declined",
      "expired",
    ];


    /*
    |--------------------------------------------------------------------------
    | Payment Not Successful
    |--------------------------------------------------------------------------
    */
    console.log(gatewayStatus);
    console.log(!successfulStatuses.includes(gatewayStatus));


    if (!successfulStatuses.includes(gatewayStatus)) {
      
      if ( failedStatuses.includes(gatewayStatus ) ) {
        console.log('ACCESS TEER');
        
        const failedPayment =
          await Payment.findOneAndUpdate(

            {
              _id:
                claimedPayment._id,

              status:
                this.PAYMENT_STATUS.PROCESSING,
            },

            {
              $set: {

                status:
                  this.PAYMENT_STATUS.FAILED,

                gatewayResponse,

                failureReason:
                  `Paystack returned status: ${gatewayStatus}`,
              },
            },

            {
              new: true,
            }
          );


        return {

          success: true,

          payment:
            failedPayment,

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
            _id:
              claimedPayment._id,

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

        payment:
          pendingPayment,

        gatewayStatus,
      };
    }


    /*
    |--------------------------------------------------------------------------
    | Verify Amount
    |--------------------------------------------------------------------------
    */

    const gatewayAmount =
      this.getGatewayAmount(
        gatewayResponse
      );


    const expectedAmount =
      Number(
        claimedPayment.amount
      );


    if (
      gatewayAmount < expectedAmount
    ) {

      const underpaidPayment =
        await Payment.findOneAndUpdate(

          {
            _id:
              claimedPayment._id,

            status:
              this.PAYMENT_STATUS.PROCESSING,
          },

          {
            $set: {

              status:
                this.PAYMENT_STATUS.FAILED,

              gatewayResponse,

              failureReason:
                `Underpayment detected. Expected ${expectedAmount} Kobo but Paystack reported ${gatewayAmount} Kobo.`,
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
          "Payment amount is less than expected",
      };
    }


    /*
    |--------------------------------------------------------------------------
    | Gateway Fee
    |--------------------------------------------------------------------------
    */

    const gatewayFee =
      this.getGatewayFee(
        gatewayResponse
      );

    console.log(gatewayFee);

    /*
    |--------------------------------------------------------------------------
    | Database Transaction
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

              _id:
                claimedPayment._id,

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
          | Already Verified
          |--------------------------------------------------------------------------
          */

          if (payment.verified) {

            settledPayment =
              payment;

            return;
          }


          /*
          |--------------------------------------------------------------------------
          | Get Payer
          |--------------------------------------------------------------------------
          */

          const payer =
            await Usercbt.findById(
              payment.payer
            ).session(session);


          if (!payer) {
            throw new Error(
              "Payment user account not found"
            );
          }


          /*
          |--------------------------------------------------------------------------
          | Determine Commission Eligibility
          |--------------------------------------------------------------------------
          |
          | ONLY:
          |
          | Student
          | +
          | First successful payment
          |
          |--------------------------------------------------------------------------
          */

          const isStudent =
            payer.role === "student";


          let commissionEligible =
            false;


          if (isStudent) {

            commissionEligible =
              await this.isFirstStudentPayment(
                payer._id,
                session
              );
          }


          /*
          |--------------------------------------------------------------------------
          | Resolve Teacher/Admin
          |--------------------------------------------------------------------------
          */

          let teacher = null;
          let admin = null;


          if (commissionEligible) {

            teacher =
              await this.resolveTeacher(
                payer,
                session
              );


            admin =
              await this.resolveAdmin(
                payer,
                teacher,
                session
              );
          }


          /*
          |--------------------------------------------------------------------------
          | Calculate Commission
          |--------------------------------------------------------------------------
          */

          const split =
            this.calculateCommission({

              amount:
                expectedAmount,

              teacher,

              admin,

              eligible:
                commissionEligible,
            });


          /*
          |--------------------------------------------------------------------------
          | Platform Net
          |--------------------------------------------------------------------------
          */

          const platformNetAmount =
            Math.max(
              split.platformAmount -
              gatewayFee,
              0
            );

            const tokenid = await generateSoftwareTokenforuser({
            user: payer,
            payment:payment ,
            session,
          });

          /*
          |--------------------------------------------------------------------------
          | Update Payment
          |--------------------------------------------------------------------------
          */
          payment.softwareToken = tokenid
          payment.status =
            this.PAYMENT_STATUS.SUCCESS;


          payment.verified =
            true;


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


          /*
          |--------------------------------------------------------------------------
          | Settlement Information
          |--------------------------------------------------------------------------
          */

          payment.metadata = {

            ...(payment.metadata || {}),

            settlement: {

              commissionEligible,

              payerId:
                payer._id,

              payerRole:
                payer.role,

              teacherId:
                teacher?._id || null,

              adminId:
                admin?._id || null,

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

                payerId:
                  payer._id,

                studentId:
                  payer._id,

                teacherId:
                  teacher._id,

                adminId:
                  admin?._id || null,

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

                payerId:
                  payer._id,

                studentId:
                  payer._id,

                teacherId:
                  teacher?._id || null,

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
          */
          

          
       
          if (payer.softwareToken=== null) {
             payer.softwareToken = tokenid
          }
         

          await payer.save({
            session,
          });
          if (
            split.platformAmount > 0
          ) {

            await WalletService.creditPlatformWallet({

              payment,

              amount:
                split.platformAmount,

              session,

              metadata: {

                payerId:
                  payer._id,

                payerRole:
                  payer.role,

                teacherId:
                  teacher?._id || null,

                adminId:
                  admin?._id || null,

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

                payerId:
                  payer._id,

                paymentType:
                  "GATEWAY_FEE",

                description:
                  "Paystack fee absorbed by platform",

                gateway:
                  "PAYSTACK",
              },
            });
          }


          /*
          |--------------------------------------------------------------------------
          | Final Payment
          |--------------------------------------------------------------------------
          */

          settledPayment =
            payment;
        }
      );


      /*
     |--------------------------------------------------------------------------
     | GENERATE A TOKEN AND SAVE IT 
     |--------------------------------------------------------------------------
     */


      /*
      |--------------------------------------------------------------------------
      | Return
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

          commissionEligible:
            settledPayment.metadata
              ?.settlement
              ?.commissionEligible || false,

          teacher:
            settledPayment.metadata
              ?.settlement
              ?.teacherId
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

          admin:
            settledPayment.metadata
              ?.settlement
              ?.adminId
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
      | Settlement Failed
      |--------------------------------------------------------------------------
      |
      | Put payment back to PENDING so it can be retried.
      |
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

  /*
  |--------------------------------------------------------------------------
  | Get All Payments for a User (Payment History)
  |--------------------------------------------------------------------------
  |
  | Returns all payments made by a specific user, sorted by newest first.
  |
  */
  /*
  |--------------------------------------------------------------------------
  | Get All Payments for a User (Payment History)
  |--------------------------------------------------------------------------
  |
  | Returns all payments made by a specific user, sorted by newest first.
  |
  */
  static async getPayments(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      status = null,
      sort = { createdAt: -1 },
    } = options;

    if (!userId) {
      throw new Error("userId is required");
    }

    const query = { payer: userId };

    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate(
          "payer",
          "firstName middleName lastName email phone role"
        )
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),

      Payment.countDocuments(query),
    ]);

    return {
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
      payments: payments.map((payment) => ({
        id: payment._id,
        txRef: payment.txRef,
        gateway: payment.gateway,
        gatewayReference: payment.gatewayReference,
        amount: payment.amount,
        amountNaira: this.fromKobo(payment.amount),
        currency: payment.currency,
        status: payment.status,
        verified: payment.verified,
        gatewayFee: payment.gatewayFee,
        gatewayFeeNaira: this.fromKobo(payment.gatewayFee),
        creditAmount: payment.creditAmount,
        creditAmountNaira: this.fromKobo(payment.creditAmount),
        paymentMethod: payment.paymentMethod,
        paymentType: payment.metadata?.paymentType || null,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      })),
    };
  }


  /*
  |--------------------------------------------------------------------------
  | Get Single Payment by Reference
  |--------------------------------------------------------------------------
  |
  | Returns details of one specific payment using its transaction reference.
  |
  */
  static async getPayment(txRef) {
    if (!txRef) {
      throw new Error("Transaction reference is required");
    }

    const payment = await Payment.findOne({ txRef }).populate(
      "payer",
      "firstName middleName lastName email phone role"
    );

    if (!payment) {
      throw new Error("Payment not found");
    }

    return {
      success: true,
      payment: {
        id: payment._id,
        txRef: payment.txRef,
        gateway: payment.gateway,
        gatewayReference: payment.gatewayReference,
        TransactionId: payment.TransactionId,
        payer: payment.payer,
        amount: payment.amount,
        amountNaira: this.fromKobo(payment.amount),
        currency: payment.currency,
        status: payment.status,
        verified: payment.verified,
        gatewayFee: payment.gatewayFee,
        gatewayFeeNaira: this.fromKobo(payment.gatewayFee),
        creditAmount: payment.creditAmount,
        creditAmountNaira: this.fromKobo(payment.creditAmount),
        paymentMethod: payment.paymentMethod,
        metadata: payment.metadata,
        verificationDate: payment.verificationDate,
        paidAt: payment.paidAt,
        failureReason: payment.failureReason,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    };
  }


  /*
  |--------------------------------------------------------------------------
  | Payment Status
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
  | Verify Pending Payments
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

        gateway:
          "PAYSTACK",

      })
        .sort({
          createdAt: 1,
        })
        .limit(
          Number(limit)
        );


    const results = [];


    for (const payment of payments) {

      try {

        const result =
          await this.verifyPayment(
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
  | Pending Payment Job
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
    | Must Be Successful
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
        Number(
          payment.creditAmount
        );

    } else {

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
      Number(
        payment.creditAmount
      )
    ) {

      throw new Error(
        "Refund amount cannot exceed credited payment amount"
      );
    }


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
