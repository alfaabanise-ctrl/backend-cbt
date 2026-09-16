import mongoose from "mongoose";
import dotenv from "dotenv";

import Usercbt from "./model/Users.js";
import Wallet from "./model/Wallet.js";

dotenv.config();

/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

const MONGO_URI = process.env.DATA_BASE;

const PLATFORM_EMAIL =
  process.env.PLATFORM_WALLET_EMAIL ||
  "platform-wallet@system.local";

/*
|--------------------------------------------------------------------------
| VALIDATION
|--------------------------------------------------------------------------
*/

if (!MONGO_URI) {
  console.error(
    "ERROR: MONGO_URI is not configured in your .env file."
  );

  process.exit(1);
}

/*
|--------------------------------------------------------------------------
| MAIN
|--------------------------------------------------------------------------
*/

async function createPlatformWallet() {
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected.");
    console.log("");

    /*
    |--------------------------------------------------------------------------
    | CHECK EXISTING PLATFORM WALLET
    |--------------------------------------------------------------------------
    */

    const existingWallet = await Wallet.findOne({
      ownerType: "PLATFORM",
      status: "ACTIVE",
    });

    if (existingWallet) {
      console.log("An active platform wallet already exists.");
      console.log("");

      console.log("Platform wallet:");
      console.log({
        id: existingWallet._id.toString(),
        owner: existingWallet.owner?.toString(),
        ownerType: existingWallet.ownerType,
        status: existingWallet.status,
        currency: existingWallet.currency,
        availableBalance:
          existingWallet.availableBalance,
        pendingBalance:
          existingWallet.pendingBalance,
        totalEarned:
          existingWallet.totalEarned,
      });

      console.log("");
      console.log("Nothing was created.");

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | FIND PLATFORM OWNER USER
    |--------------------------------------------------------------------------
    */

    let platformUser = await Usercbt.findOne({
      email: PLATFORM_EMAIL.toLowerCase(),
    });

    /*
    |--------------------------------------------------------------------------
    | CREATE PLATFORM OWNER USER
    |--------------------------------------------------------------------------
    */

    if (!platformUser) {
      console.log(
        "Platform wallet owner does not exist."
      );

      console.log(
        "Creating dedicated platform owner user..."
      );

      platformUser = await Usercbt.create({
        firstName: "Platform",
        middleName: null,
        lastName: "Wallet",
        email: PLATFORM_EMAIL.toLowerCase(),
        role: "admin",
        status: "Active",
        commissionPercentage: 0,
        walletBalance: 0,
        emailVerified: true,
      });

      console.log(
        "Platform owner created:"
      );

      console.log(
        platformUser._id.toString()
      );

      console.log("");
    } else {
      console.log(
        "Existing platform owner found:"
      );

      console.log(
        platformUser._id.toString()
      );

      console.log("");
    }

    /*
    |--------------------------------------------------------------------------
    | CHECK WHETHER THIS USER ALREADY HAS A WALLET
    |--------------------------------------------------------------------------
    */

    const existingOwnerWallet =
      await Wallet.findOne({
        owner: platformUser._id,
      });

    if (existingOwnerWallet) {
      console.log(
        "The platform owner already has a wallet."
      );

      console.log({
        id: existingOwnerWallet._id.toString(),
        owner:
          existingOwnerWallet.owner.toString(),
        ownerType:
          existingOwnerWallet.ownerType,
        status:
          existingOwnerWallet.status,
      });

      /*
       * If the wallet belongs to this dedicated
       * platform user, convert it to PLATFORM.
       */
      if (
        existingOwnerWallet.ownerType !==
        "PLATFORM"
      ) {
        console.log("");
        console.log(
          "Converting this dedicated wallet to PLATFORM..."
        );

        existingOwnerWallet.ownerType =
          "PLATFORM";

        existingOwnerWallet.status =
          "ACTIVE";

        existingOwnerWallet.currency =
          "NGN";

        await existingOwnerWallet.save();

        console.log("");
        console.log(
          "Platform wallet configured successfully."
        );
      }

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | CREATE PLATFORM WALLET
    |--------------------------------------------------------------------------
    */

    const platformWallet =
      await Wallet.create({
        owner: platformUser._id,

        ownerType: "PLATFORM",

        currency: "NGN",

        availableBalance: 0,

        pendingBalance: 0,

        totalEarned: 0,

        totalWithdrawn: 0,

        totalRefunded: 0,

        status: "ACTIVE",

        bankDetails: {
          bankCode: null,
          bankName: null,
          accountNumber: null,
          accountName: null,
          verified: false,
        },

        lastTransactionAt: null,

        lastWithdrawalAt: null,
      });

    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    console.log("");
    console.log(
      "================================================"
    );

    console.log(
      "PLATFORM WALLET CREATED SUCCESSFULLY"
    );

    console.log(
      "================================================"
    );

    console.log("");

    console.log({
      walletId:
        platformWallet._id.toString(),

      owner:
        platformWallet.owner.toString(),

      ownerType:
        platformWallet.ownerType,

      status:
        platformWallet.status,

      currency:
        platformWallet.currency,

      availableBalance:
        platformWallet.availableBalance,

      pendingBalance:
        platformWallet.pendingBalance,

      totalEarned:
        platformWallet.totalEarned,
    });

    console.log("");

    console.log(
      "Your WalletService.getPlatformWallet() should now find this wallet."
    );

  } catch (error) {
    console.error("");
    console.error(
      "FAILED TO CREATE PLATFORM WALLET"
    );
    console.error("");

    console.error(
      error?.message || error
    );

    if (error?.code === 11000) {
      console.error("");
      console.error(
        "MongoDB reported a duplicate key."
      );

      console.error(
        "Check your Wallet owner unique index and existing wallets."
      );
    }

    process.exitCode = 1;

  } finally {
    await mongoose.disconnect();

    console.log("");
    console.log(
      "MongoDB connection closed."
    );
  }
}

/*
|--------------------------------------------------------------------------
| RUN
|--------------------------------------------------------------------------
*/

createPlatformWallet();