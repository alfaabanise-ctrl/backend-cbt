
import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
import "dotenv/config";
import mongoose from "mongoose";
import Wallet from "./model/Wallet.js";

// ============================================================
// DATABASE
// ============================================================

const MONGO_URI =
  process.env.DATA_BASE || "mongodb://127.0.0.1:27017/turtoril";

// ============================================================
// PLATFORM WALLET TO KEEP
// ============================================================

const PLATFORM_WALLET_ID = "6aaaa3fbb080c9950a847744";

// ============================================================
// CLEAN WALLETS
// ============================================================

const cleanWallets = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected.");
    console.log("Database:", mongoose.connection.name);

    // Find the platform wallet before deleting anything.
    const platformWallet = await Wallet.findById(
      PLATFORM_WALLET_ID
    );

    if (!platformWallet) {
      throw new Error(
        "Platform wallet not found. No wallets were deleted."
      );
    }

    console.log("Platform wallet found:", platformWallet._id);

    // Reset numeric balance fields defined in the wallet document.
    const balanceFields = [
      "balance",
      "availableBalance",
      "pendingBalance",
      "lockedBalance",
    ];

    for (const field of balanceFields) {
      if (platformWallet.get(field) !== undefined) {
        platformWallet.set(field, 0);
      }
    }

    await platformWallet.save();

    // Delete every wallet except the platform wallet.
    const result = await Wallet.deleteMany({
      _id: { $ne: platformWallet._id },
    });

    console.log("\n==================================");
    console.log(" PLATFORM WALLET CLEANUP COMPLETE");
    console.log("==================================");
    console.log("Platform wallet preserved:", platformWallet._id);
    console.log("Other wallets deleted:", result.deletedCount);

    // Verify the result.
    const remainingWallets = await Wallet.find({}).lean();

    console.log("Wallets remaining:", remainingWallets.length);
    console.log("Platform wallet balance fields:");

    const updatedPlatformWallet = await Wallet.findById(
      PLATFORM_WALLET_ID
    ).lean();

    console.log({
      balance: updatedPlatformWallet.balance,
      availableBalance: updatedPlatformWallet.availableBalance,
      pendingBalance: updatedPlatformWallet.pendingBalance,
      lockedBalance: updatedPlatformWallet.lockedBalance,
    });

    console.log("==================================");
  } catch (error) {
    console.error("Wallet cleanup failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log("MongoDB connection closed.");
    }
  }
};

cleanWallets();
