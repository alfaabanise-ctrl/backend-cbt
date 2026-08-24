// jobs/paymentVerification.job.js

import cron from "node-cron";
import PaymentService from "../service/payment.service.js";

let isRunning = false;

export const startPaymentVerificationJob = () => {

    cron.schedule(
        "*/5 * * * *",
        async () => {

            /*
            Prevent overlapping jobs.

            If the previous verification is still
            running, don't start another one.
            */

            if (isRunning) {

                console.log(
                    "Payment verification job is already running. Skipping."
                );

                return;
            }

            isRunning = true;

            console.log(
                "Starting pending payment verification..."
            );

            try {

                const result =
                    await PaymentService
                        .verifyAllPendingPayments();

                console.log(
                    "Payment verification completed:",
                    result
                );

            } catch (error) {

                console.error(
                    "Payment verification job failed:",
                    error
                );

            } finally {

                isRunning = false;
            }
        }
    );

    console.log(
        "Payment verification job scheduled. Runs every 5 minutes."
    );
};