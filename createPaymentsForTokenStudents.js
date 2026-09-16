// scripts/createPaymentsForTokenStudents.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";

import Usercbt from "./model/Users.js";
import SoftwareToken from "./model/SoftwareToken.js";
import Payment from "./model/Payment.js";

dotenv.config();

const MONGO_URI = process.env.DATA_BASE;

// CHANGE THIS TO YOUR ACTUAL TOKEN PRICE
const TOKEN_PRICE = 5000;

const generateTxRef = () => {
  return `TOKEN-BACKFILL-${Date.now()}-${crypto
    .randomBytes(5)
    .toString("hex")
    .toUpperCase()}`;
};

async function createPayments() {
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log("Connected.");

    // Find students that have a software token
    const students = await Usercbt.find({
      role: "student",
      softwareToken: { $ne: null },
    }).select(
      "_id firstName middleName lastName email softwareToken adminOwner teacherOwner"
    );

    console.log(`Found ${students.length} students with tokens.`);

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const student of students) {
      try {
        // Get the student's token
        const token = await SoftwareToken.findById(
          student.softwareToken
        );

        if (!token) {
          console.log(
            `SKIP: ${student.email} - token not found`
          );

          skipped++;
          continue;
        }

        // Prevent duplicate payment records
        const existingPayment = await Payment.findOne({
          payer: student._id,
          softwareToken: token._id,
          subscriptionType: "SOFTWARE_TOKEN",
          status: "SUCCESS",
          verified: true,
        });

        if (existingPayment) {
          console.log(
            `SKIP: ${student.email} - payment already exists`
          );

          skipped++;
          continue;
        }

        // Create payment
        const payment = await Payment.create({
          txRef: generateTxRef(),

          gatewayReference: null,

          TransactionId: null,

          gateway: "PAYSTACK",

          paymentMethod: "UNKNOWN",

          payer: student._id,

          softwareToken: token._id,

          token: token.token,

          subscriptionType: "SOFTWARE_TOKEN",

          amount: TOKEN_PRICE,

          currency: "NGN",

          gatewayFee: 0,

          creditAmount: TOKEN_PRICE,

          status: "SUCCESS",

          verified: true,

          verificationDate:
            token.activatedAt ||
            token.createdAt ||
            new Date(),

          paidAt:
            token.activatedAt ||
            token.createdAt ||
            new Date(),

          webhookReceived: false,

          webhookProcessed: false,

          metadata: {
            source: "TOKEN_BACKFILL",
            reason: "Existing software token",
            softwareTokenId: token._id.toString(),
          },
        });

        created++;

        console.log(
          `CREATED: ${student.email} -> ${payment._id}`
        );
      } catch (error) {
        failed++;

        console.error(
          `FAILED: ${student.email}`,
          error.message
        );
      }
    }

    console.log("\n================================");
    console.log("PAYMENT BACKFILL COMPLETE");
    console.log("================================");

    console.log(`Students with tokens: ${students.length}`);
    console.log(`Payments created:     ${created}`);
    console.log(`Skipped:              ${skipped}`);
    console.log(`Failed:               ${failed}`);

    await mongoose.disconnect();

    console.log("MongoDB disconnected.");
    process.exit(0);
  } catch (error) {
    console.error("BACKFILL ERROR:", error);

    await mongoose.disconnect();

    process.exit(1);
  }
}

createPayments();