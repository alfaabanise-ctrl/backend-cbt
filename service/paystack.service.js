import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

/**
 * Get Paystack Transaction Fee
 */



class PaystackService {

    constructor() {

        this.http = axios.create({

            baseURL: "https://api.paystack.co",

            timeout: 30000,

            headers: {

                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,

                "Content-Type": "application/json"

            }

        });

    }

    /*
    |--------------------------------------------------------------------------
    | Initialize Transaction
    |--------------------------------------------------------------------------
    */

    /**
 * Get Paystack Transaction Fee
 */
    calculatePaystackFee(amountInKobo) {
        const amount = amountInKobo / 100;

        let fee = amount * 0.015;

        if (amount >= 2500) {
            fee += 200;
        }

        if (fee > 2000) {
            fee = 2000;
        }

        return Math.round(fee * 100); // return Kobo
    }

    async initializeTransaction({

        email,

        amount,

        reference,

        callback_url,

        currency = "NGN",

        metadata = {}

    }) {

        try {

            // Original amount (Naira)
            const originalAmount = Number(amount);

            // Get Paystack fee
            const paystackFee = this.calculatePaystackFee(originalAmount);

            // Buyer pays this
            const totalWithCharges = originalAmount + paystackFee;

            const { data } = await this.http.post(
                "/transaction/initialize",
                {
                    email,

                    amount: totalWithCharges,

                    reference,

                    callback_url,

                    currency,
                    metadata: {
                        ...metadata,

                        originalAmount,
                        paystackFee,
                        totalWithCharges
                    }
                }
            );

            return {
                ...data,
                paymentSummary: {
                    originalAmount,
                    paystackFee: paystackFee,
                    totalWithCharges
                }
            };

        } catch (error) {

            console.error(
                "Paystack Initialize Error:",
                error.response?.data || error.message
            );

            throw new Error(
                error.response?.data?.message ||
                "Unable to initialize transaction."
            );

        }

    }

    /*
    |--------------------------------------------------------------------------
    | Verify Transaction
    |--------------------------------------------------------------------------
    */

    async verifyTransaction(reference) {

        try {

            const { data } = await this.http.get(

                `/transaction/verify/${reference}`

            );

            return data;

        } catch (error) {

            console.error(
                "Paystack Verify Error:",
                error.response?.data || error.message
            );

            throw new Error(
                error.response?.data?.message ||
                "Unable to verify transaction."
            );

        }

    }

    async getBanks(country = "nigeria") {

        try {

            const { data } = await this.http.get("/bank", {

                params: {

                    country,
                    currency: "NGN"

                }

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

    /*
|--------------------------------------------------------------------------
| Resolve Account Number
|--------------------------------------------------------------------------
*/

    async resolveAccountNumber({

        accountNumber,
        bankCode

    }) {

        try {

            const { data } = await this.http.get("/bank/resolve", {

                params: {

                    account_number: accountNumber,
                    bank_code: bankCode

                }

            });

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

}

export default new PaystackService();