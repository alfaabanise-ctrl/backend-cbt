import axios from "axios";

class FlutterwaveService {

    constructor() {

        this.http = axios.create({
            baseURL: "https://api.flutterwave.com/v3",
            headers: {
                Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                "Content-Type": "application/json"
            },
            timeout: 30000
        });

    }

    /**
     * Hosted Checkout
     */


    async initializePayment({

        txRef,
        amount,
        currency = "NGN",
        redirectUrl,
        customer,
        customizations = {},
        paymentOptions = "card"

    }) {
        console.log({
            txRef,
            redirectUrl,
            amount,
            customer
        });

        try {
            console.log(process.env.FLW_SECRET_KEY);
            const { data } = await this.http.post("/payments", {

                tx_ref: txRef,

                amount,

                currency,

                redirect_url: redirectUrl,

                payment_options: paymentOptions,

                customer: {
                    email: customer.email,
                    name: customer.name,
                    phonenumber: customer.phonenumber || ""
                },

                customizations

            });

            return data;

        } catch (error) {

            console.log(error.response?.data);

            throw new Error(

                error.response?.data?.message ||

                "Flutterwave payment initialization failed."

            );

        }

    }

    /**
     * Hosted Card Checkout
     */
    async initializeCardPayment(options) {

        return this.initializePayment({

            ...options,

            paymentOptions: "card"

        });

    }

    /**
     * Hosted Bank Transfer Checkout
     */
    async initializeBankTransferPayment(options) {

        return this.initializePayment({

            ...options,

            paymentOptions: "banktransfer"

        });

    }

    async verifyPaymentByTxRef(txRef) {
        try {

            // Search transaction by tx_ref
            const { data } = await this.http.get("/transactions", {
                params: {
                    tx_ref: txRef
                }
            });

            if (!data.data || data.data.length === 0) {
                throw new Error("Transaction not found.");
            }

            const transaction = data.data[0];

            // Verify transaction using its ID
            return await this.verifyPayment(transaction.id);

        } catch (error) {

            throw new Error(
                error.response?.data?.message ||
                error.message ||
                "Payment verification failed."
            );

        }
    }

    /**
     * Verify Transaction
     */
    async verifyPayment(transactionId) {

        try {

            const { data } = await this.http.get(

                `/transactions/${transactionId}/verify`

            );

            return data;

        } catch (error) {

            throw new Error(

                error.response?.data?.message ||

                "Payment verification failed."

            );

        }

    }

}


export default new FlutterwaveService();