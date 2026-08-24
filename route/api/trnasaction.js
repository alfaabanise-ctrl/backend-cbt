import express from "express";
const router = express.Router()
import {  getTransactions, getWalletDashboard } from "../../controllers/transaction.js";
import { protect} from "../../middleware/auth.js";
import uploadAvatar from "../../middleware/upload.js"
// router.post("/upload-avatar", protect,  uploadAvatar.single("avatar"), updateproperty);


router.get("/", protect, getTransactions);
router.get("/wallet/dashboard", protect, getWalletDashboard);

export default router;