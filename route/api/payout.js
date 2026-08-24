import express from "express";
const router = express.Router()
import {  verifyBankAccount, createPayout,  getBanks } from "../../controllers/payout.js";
import { saveAccount, updateBankAccountStatus,  getAllBankAccounts, getBankAndKycForVerify,  getBankAccount } from "../../controllers/bankdetails.js";
import { protect, admin} from "../../middleware/auth.js";
import uploadAvatar from "../../middleware/upload.js"
 




router.get("/banks",  getBanks);
router.post("/create", createPayout);
router.post("/save-bank-account", protect, saveAccount);
router.get("/bank-details", protect, getBankAccount);
router.post("/banks/verify", verifyBankAccount);



//admiin SIde

router.get("/get-accounts", admin, getAllBankAccounts)
router.get("/bank-account/:userId", admin, getBankAndKycForVerify)
router.patch("/bank-account/:id/status", admin, updateBankAccountStatus);
export default router;