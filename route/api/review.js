
import express from "express";
const router = express.Router()
import {  createOrUpdateReview, getReviewsBySeller,  getReview } from "../../controllers/reviews.js";
 import { protect} from "../../middleware/auth.js";




router.post("/", protect,  createOrUpdateReview);
router.get("/:id", protect, getReview)
router.get("/seller/:sellerId", getReviewsBySeller)





//admiin SIde


export default router;