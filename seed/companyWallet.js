import mongoose from "mongoose";
import dotenv from "dotenv";

import Wallet from "../model/Wallet.js";

dotenv.config();

async function createCompanyWallet() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const existingWallet = await Wallet.findOne({
            ownerType: "PLATFORM"
        });

        if (existingWallet) {
            console.log("Platform wallet already exists.");
            console.log(existingWallet);
            process.exit(0);
        }

        const wallet = await Wallet.create({
            owner: null,
            ownerType: "PLATFORM",
            balance: 0,
            currency: "NGN",
            status: "ACTIVE"
        });

        console.log("Platform wallet created successfully.");
        console.log(wallet);

        process.exit(0);

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

createCompanyWallet();