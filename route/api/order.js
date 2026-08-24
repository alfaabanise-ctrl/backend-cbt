import express from "express";
const router = express.Router()
import {  getOrders, getOrdersAdmin, changeEscrowStatus,  OrderEvidenImageUpload, getOrderEvidence,  deleteOrderEvidence } from "../../controllers/ordercontroller.js";
import { protect, admin} from "../../middleware/auth.js";
import uploadAvatar from "../../middleware/upload.js"
// router.post("/upload-avatar", protect,  uploadAvatar.single("avatar"), updateproperty);


router.get("/", protect,  getOrders)
router.post('/evidence/upload/:id/:type',  protect, uploadAvatar.single("file"), OrderEvidenImageUpload)
// router.post("/:id", protect,  updateproperty);
// router.patch('/:id/status', protect, updatePropertyStatus)


// updateogImage

router.delete("/evidence/:id", protect, deleteOrderEvidence);
router.get("/evidence/:id", protect,  getOrderEvidence);

// router.get("/og/:id",   getPropertyByIdForOgImg);



router.post("/status/:id/:action", protect, changeEscrowStatus)

router.get("/admin/orders", admin,  getOrdersAdmin);

export default router;
