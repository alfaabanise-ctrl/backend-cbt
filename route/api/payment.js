import express from "express";
const router = express.Router()
import {  getTransactionpayemt, getTransactionbyProperty, verifyOrder, createOrderPayment  } from "../../controllers/payment.js";
import { protect} from "../../middleware/auth.js";
import uploadAvatar from "../../middleware/upload.js"


router.get("/",   protect, getTransactionpayemt)
router.post("/property/verify-order", verifyOrder)
router.post("/property/:id", protect, createOrderPayment)
router.get("/property/:slug/transactions", protect, getTransactionbyProperty)
export default router;


