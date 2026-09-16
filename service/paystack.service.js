// service/paystack.service.js

import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

class PaystackService {
  constructor() {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.warn(
        "WARNING: PAYSTACK_SECRET_KEY is not configured."
      );
    }

    this.http = axios.create({
      baseURL: "https://api.paystack.co",
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });
  }

  // ============================================================
  // PAYSTACK FEE
  // ============================================================

  /**
   * Calculate Paystack fee.
   *
   * Input:
   *   amountInKobo
   *
   * Output:
   *   feeInKobo
   */
  calculatePaystackFee(amountInKobo) {
    const amountNaira = Number(amountInKobo) / 100;

    let feeNaira = amountNaira * 0.015;

    if (amountNaira >= 2500) {
      feeNaira += 200;
    }

    if (feeNaira > 2000) {
      feeNaira = 2000;
    }

    return Math.round(feeNaira * 100);
  }

  // ============================================================
  // INITIALIZE PAYMENT
  // ============================================================

  /**
   * Initialize Paystack transaction.
   *
   * IMPORTANT:
   * amount is expected in KOBO.
   *
   * Example:
   *
   * ₦5,000 = 500000 kobo
   */
  async initializePayment({
    email,
    amount,
    reference,
    callbackUrl = null,
    currency = "NGN",
    metadata = {},
    chargeCustomer = false,
  }) {
    try {
      if (!email) {
        throw new Error("Customer email is required.");
      }

      if (!reference) {
        throw new Error("Payment reference is required.");
      }

      const amountInKobo = Math.round(Number(amount));

      if (!Number.isFinite(amountInKobo) || amountInKobo <= 0) {
        throw new Error("Payment amount must be greater than zero.");
      }

      /*
       * Your PaymentService can decide whether the customer
       * pays the gateway fee.
       *
       * Default:
       * chargeCustomer = false
       *
       * This means:
       *
       * Customer pays ₦5,000
       * Paystack fee is absorbed by platform.
       */

      let finalAmountInKobo = amountInKobo;
      let paystackFee = 0;

      if (chargeCustomer) {
        paystackFee = this.calculatePaystackFee(amountInKobo);
        finalAmountInKobo = amountInKobo + paystackFee;
      }

      const payload = {
        email,
        amount: finalAmountInKobo,
        reference,
        currency,

        metadata: {
          ...metadata,

          originalAmount: amountInKobo,

          paystackFee,

          totalWithCharges: finalAmountInKobo,
        },
      };

      if (callbackUrl) {
        payload.callback_url = callbackUrl;
      }

      const { data } = await this.http.post(
        "/transaction/initialize",
        payload
      );

      if (!data?.status) {
        throw new Error(
          data?.message ||
            "Paystack failed to initialize payment."
        );
      }

      return {
        success: true,

        status: data.status,

        message: data.message,

        authorizationUrl:
          data.data?.authorization_url || null,

        accessCode:
          data.data?.access_code || null,

        reference:
          data.data?.reference || reference,

        paymentSummary: {
          originalAmount: amountInKobo,

          paystackFee,

          totalWithCharges: finalAmountInKobo,
        },

        raw: data,
      };
    } catch (error) {
      console.error(
        "Paystack Initialize Error:",
        error.response?.data || error.message
      );

      throw new Error(
        error.response?.data?.message ||
          error.message ||
          "Unable to initialize Paystack payment."
      );
    }
  }

  // ============================================================
  // VERIFY PAYMENT
  // ============================================================

  /**
   * Verify a Paystack transaction.
   */
  async verifyPayment(reference) {
    try {
      if (!reference) {
        throw new Error(
          "Transaction reference is required."
        );
      }

      const { data } = await this.http.get(
        `/transaction/verify/${encodeURIComponent(reference)}`
      );

      return data;
    } catch (error) {
      console.error(
        "Paystack Verify Error:",
        error.response?.data || error.message
      );

      throw new Error(
        error.response?.data?.message ||
          error.message ||
          "Unable to verify Paystack payment."
      );
    }
  }

  // ============================================================
  // GET BANKS
  // ============================================================

  async getBanks(country = "nigeria") {
    try {
      const { data } = await this.http.get("/bank", {
        params: {
          country,
          currency: "NGN",
        },
      });

      return data;
    } catch (error) {
      console.error(
        "Paystack Get Banks Error:",
        error.response?.data || error.message
      );

      throw new Error(
        error.response?.data?.message ||
          "Unable to fetch banks."
      );
    }
  }

  // ============================================================
  // RESOLVE BANK ACCOUNT
  // ============================================================

  async resolveAccountNumber({
    accountNumber,
    bankCode,
  }) {
    try {
      if (!accountNumber) {
        throw new Error(
          "Bank account number is required."
        );
      }

      if (!bankCode) {
        throw new Error(
          "Bank code is required."
        );
      }

      const { data } = await this.http.get(
        "/bank/resolve",
        {
          params: {
            account_number: accountNumber,
            bank_code: bankCode,
          },
        }
      );

      return data;
    } catch (error) {
      console.error(
        "Paystack Resolve Account Error:",
        error.response?.data || error.message
      );

      throw new Error(
        error.response?.data?.message ||
          "Unable to verify bank account."
      );
    }
  }

  // ============================================================
  // GET TRANSACTION
  // ============================================================

  async getTransaction(reference) {
    return this.verifyPayment(reference);
  }

  // ============================================================
  // COMPATIBILITY METHODS
  // ============================================================

  /*
   * These two methods allow old code using
   * initializeTransaction() / verifyTransaction()
   * to continue working.
   */

  async initializeTransaction(options) {
    return this.initializePayment(options);
  }

  async verifyTransaction(reference) {
    return this.verifyPayment(reference);
  }
}

export default new PaystackService();