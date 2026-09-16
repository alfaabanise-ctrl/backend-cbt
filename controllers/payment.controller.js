
/*
|--------------------------------------------------------------------------
| Payment Controller
|--------------------------------------------------------------------------
|
| Handles:
| - Initialize general payment
| - Verify Paystack payment
| - Get payment
| - Get payment status
| - Verify pending payments
| - Validate refund
|
|--------------------------------------------------------------------------
*/

import PaymentService from "../service/payment.service.js";


class PaymentController {

  /*
  |--------------------------------------------------------------------------
  | Initialize Payment
  |--------------------------------------------------------------------------
  |
  | POST /payment/initialize
  |
  | Body:
  |
  | {
  |   amount: 5000,
  |
  |   metadata: {
  |     paymentType: "PIN_PURCHASE",
  |     pinId: "...",
  |     quantity: 1
  |   }
  | }
  |
  |--------------------------------------------------------------------------
  */

  static async initializePayment(req, res) {

    try {

      /*
      |--------------------------------------------------------------------------
      | Authenticated User
      |--------------------------------------------------------------------------
      */

      const payerId =
        req.user?._id;


      if (!payerId) {

        return res.status(401).json({

          success: false,

          message:
            "Authentication required",

        });
      }


      /*
      |--------------------------------------------------------------------------
      | Request Body
      |--------------------------------------------------------------------------
      */

      const {
       
        paymentMethod = "UNKNOWN",
        metadata = {},
      } = req.body;

      const amount = 4000
      /*
      |--------------------------------------------------------------------------
      | Validate Amount
      |--------------------------------------------------------------------------
      */

      if (
        amount === undefined ||
        amount === null
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Payment amount is required",

        });
      }


      /*
      |--------------------------------------------------------------------------
      | Initialize Payment
      |--------------------------------------------------------------------------
      */

      const result =
        await PaymentService.initializePayment({

          payerId,

          amount,

          paymentMethod,

          metadata,

          ipAddress:
            req.ip || null,

          device:
            req.headers["user-agent"] || null,

        });


      /*
      |--------------------------------------------------------------------------
      | Response
      |--------------------------------------------------------------------------
      */

      return res.status(201).json({

        success: true,

        message:
          "Payment initialized successfully",

        data: result,

      });

    }

    catch (error) {

      console.error(
        "Initialize payment error:",
        error
      );


      return res.status(400).json({

        success: false,

        message:
          error.message ||
          "Unable to initialize payment",

      });
    }
  }


  /*
  |--------------------------------------------------------------------------
  | Verify Payment
  |--------------------------------------------------------------------------
  |
  | POST /payment/verify
  |
  | Body:
  |
  | {
  |   ref: "CBT-..."
  | }
  |
  |--------------------------------------------------------------------------
  */

  static async verifyPayment(req, res) {

    try {

      const {
        ref,
        txRef,
      } = req.body;


      /*
      |--------------------------------------------------------------------------
      | Accept either ref or txRef
      |--------------------------------------------------------------------------
      */

      const reference =
        ref || txRef;


      if (!reference) {

        return res.status(400).json({

          success: false,

          message:
            "Transaction reference is required",

        });
      }


      /*
      |--------------------------------------------------------------------------
      | Verify + Settle
      |--------------------------------------------------------------------------
      |
      | PaymentService handles:
      |
      | - Paystack verification
      | - Amount verification
      | - First student payment check
      | - Teacher commission
      | - Admin commission
      | - Platform share
      | - Wallet settlement
      | - Idempotency
      |
      |--------------------------------------------------------------------------
      */

      const result =
        await PaymentService.verifyPayment(
          reference
        );


      /*
      |--------------------------------------------------------------------------
      | Payment Still Pending
      |--------------------------------------------------------------------------
      */

      if (
        result.pending ||
        result.processing
      ) {

        return res.status(200).json({

          success: false,

          pending:
            result.pending || false,

          processing:
            result.processing || false,

          message:
            result.message ||
            "Payment is still being processed",

          data: result,

        });
      }


      /*
      |--------------------------------------------------------------------------
      | Payment Failed
      |--------------------------------------------------------------------------
      */

      if (!result.success) {

        return res.status(400).json({

          success: false,

          message:
            result.error ||
            result.message ||
            "Payment verification failed",

          data: result,

        });
      }


      /*
      |--------------------------------------------------------------------------
      | Successful Payment
      |--------------------------------------------------------------------------
      */

      return res.status(200).json({

        success: true,

        message:
          result.message ||
          "Payment verified successfully",

        data: result,

      });

    }

    catch (error) {

      console.error(
        "Verify payment error:",
        error
      );


      return res.status(400).json({

        success: false,

        message:
          error.message ||
          "Payment verification failed",

      });
    }
  }


  /*
  |--------------------------------------------------------------------------
  | Get Payment
  |--------------------------------------------------------------------------
  |
  | GET /payment/:txRef
  |
  |--------------------------------------------------------------------------
  */

  static async getPayment(req, res) {

    try {

      const {
        txRef,
      } = req.params;


      const payment =
        await PaymentService.getPayment(
          txRef
        );


      if (!payment) {

        return res.status(404).json({

          success: false,

          message:
            "Payment not found",

        });
      }


      return res.status(200).json({

        success: true,

        data: payment,

      });

    }

    catch (error) {

      console.error(
        "Get payment error:",
        error
      );


      return res.status(400).json({

        success: false,

        message:
          error.message ||
          "Unable to get payment",

      });
    }
  }


  /*
  |--------------------------------------------------------------------------
  | Payment Status
  |--------------------------------------------------------------------------
  |
  | GET /payment/:txRef/status
  |
  |--------------------------------------------------------------------------
  */

  static async getPaymentStatus(req, res) {

    try {

      const {
        txRef,
      } = req.params;


      const result =
        await PaymentService.getPaymentStatus(
          txRef
        );


      return res.status(200).json({

        success: true,

        data: result,

      });

    }

    catch (error) {

      console.error(
        "Get payment status error:",
        error
      );


      return res.status(404).json({

        success: false,

        message:
          error.message ||
          "Unable to get payment status",

      });
    }
  }


  /*
  |--------------------------------------------------------------------------
  | Verify All Pending Payments
  |--------------------------------------------------------------------------
  |
  | POST /payment/verify-pending
  |
  | Usually called by admin/cron/job.
  |
  |--------------------------------------------------------------------------
  */

  static async verifyPendingPayments(req, res) {

    try {

      const limit =
        Number(
          req.body?.limit ||
          req.query?.limit ||
          50
        );


      const result =
        await PaymentService.verifyAllPendingPayments({

          limit,

        });


      return res.status(200).json({

        success: true,

        message:
          "Pending payments processed",

        data: result,

      });

    }

    catch (error) {

      console.error(
        "Verify pending payments error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Unable to verify pending payments",

      });
    }
  }


  /*
  |--------------------------------------------------------------------------
  | Validate Refund
  |--------------------------------------------------------------------------
  |
  | POST /payment/refund/validate
  |
  | Body:
  |
  | {
  |   txRef: "...",
  |   refundAmount: 5000
  | }
  |
  |--------------------------------------------------------------------------
  */

  static async validateRefund(req, res) {

    try {

      const {
        txRef,
        refundAmount,
      } = req.body;


      const result =
        await PaymentService.validateRefund(

          txRef,

          refundAmount

        );


      return res.status(200).json({

        success: true,

        data: result,

      });

    }

    catch (error) {

      console.error(
        "Validate refund error:",
        error
      );


      return res.status(400).json({

        success: false,

        message:
          error.message ||
          "Refund validation failed",

      });
    }
  }

/*
|--------------------------------------------------------------------------
| Payment History Controller
|--------------------------------------------------------------------------
*/

static async PaymentHistory(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    console.log(userId);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. User not found in request.",
      });
    }

    const {
      page = 1,
      limit = 20,
      status,
    } = req.query;

    const result = await PaymentService.getPayments(userId, {
      page: Number(page),
      limit: Number(limit),
      status: status || null,
    });

    return res.status(200).json({
      success: true,
      message: "Payment history fetched successfully.",
      data: result,
    });

  } catch (error) {
    console.error("PaymentHistory error:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Unable to fetch payment history.",
    });
  }
}
}


export default PaymentController;
