import "dotenv/config";
import mongoose from "mongoose";
import SoftwarePwaChallenge from "../model/SoftwarePwaChallenge.js";
import SoftwarePwaDeviceBinding from "../model/SoftwarePwaDeviceBinding.js";

async function migrate() {
  if (!process.env.DATA_BASE) {
    throw new Error("DATA_BASE must be configured before running this migration.");
  }

  await mongoose.connect(process.env.DATA_BASE);
  try {
    await SoftwarePwaDeviceBinding.createIndexes();
    await SoftwarePwaChallenge.createIndexes();
    console.log("PWA WebAuthn indexes created successfully.");
  } finally {
    await mongoose.disconnect();
  }
}

migrate().catch((error) => {
  console.error("PWA WebAuthn index migration failed:", error.message);
  process.exitCode = 1;
});
