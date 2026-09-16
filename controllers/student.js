import PaymentService from "../services/payment.service.js";

/**
 * =========================================================
 * CREATE STUDENT PAYMENT
 * =========================================================
 *
 * IMPORTANT:
 * Frontend sends NOTHING.
 *
 * Backend determines:
 * - student
 * - amount
 * - payment type
 * - teacher
 * - admin
 * - commission
 *
 * req.user._id comes from authMiddleware.
 */
export const createStudentPayment = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can create student payments",
      });
    }

    const result = await PaymentService.createStudentPayment({
      studentId: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Payment initialized successfully",
      data: result,
    });
  } catch (error) {
    console.error(
      "createStudentPayment error:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Unable to initialize payment",
    });
  }
};


/**
 * =========================================================
 * VERIFY STUDENT PAYMENT
 * =========================================================
 *
 * Frontend sends ONLY:
 *
 * {
 *   txRef: "..."
 * }
 *
 * Never trust amount from frontend.
 */
export const verifyStudentPayment = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { txRef } = req.body;

    if (!txRef || typeof txRef !== "string") {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required",
      });
    }

    const payment = await PaymentService.getPayment(
      txRef
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    /*
     * SECURITY:
     * A student can only verify their own payment.
     */
    if (
      String(payment.userId) !==
      String(req.user._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to verify this payment",
      });
    }

    const result =
      await PaymentService.verifyStudentPayment(
        txRef
      );

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: result,
    });
  } catch (error) {
    console.error(
      "verifyStudentPayment error:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Unable to verify payment",
    });
  }
};


/**
 * =========================================================
 * GET STUDENT PAYMENT STATUS
 * =========================================================
 */
export const getStudentPaymentStatus = async (
  req,
  res
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { txRef } = req.params;

    if (!txRef) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required",
      });
    }

    const payment =
      await PaymentService.getPayment(txRef);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (
      String(payment.userId) !==
      String(req.user._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    const result =
      await PaymentService.getPaymentStatus(
        txRef
      );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "getStudentPaymentStatus error:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Unable to get payment status",
    });
  }
};


/**
 * =========================================================
 * GET ONE STUDENT PAYMENT
 * =========================================================
 */
export const getStudentPayment = async (
  req,
  res
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { txRef } = req.params;

    const payment =
      await PaymentService.getPayment(txRef);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    /*
     * Student can only see own payment.
     */
    if (
      req.user.role === "student" &&
      String(payment.userId) !==
        String(req.user._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    return res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error(
      "getStudentPayment error:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Unable to get payment",
    });
  }
};


/**
 * =========================================================
 * ADMIN VERIFY PENDING PAYMENTS
 * =========================================================
 */
export const verifyPendingPayments = async (
  req,
  res
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (
      !["admin", "superadmin"].includes(
        req.user.role
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const result =
      await PaymentService.verifyAllPendingPayments();

    return res.status(200).json({
      success: true,
      message: "Pending payments processed",
      data: result,
    });
  } catch (error) {
    console.error(
      "verifyPendingPayments error:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message ||
        "Unable to process pending payments",
    });
  }
};