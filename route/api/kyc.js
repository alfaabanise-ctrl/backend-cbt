import express from "express";
const router = express.Router()
import { getKyc, updateKyc  } from "../../controllers/kyc.js";
import { protect} from "../../middleware/auth.js";
import uploadAvatar from "../../middleware/upload.js"



router.use(protect);
router.get("/",  getKyc);
router.post(
  "/verify",
  protect,
  uploadAvatar.fields([
    { name: "ninImage", maxCount: 1 },
    { name: "faceImage", maxCount: 1 },
    { name: "cacImage", maxCount: 1 }
  ]),
  updateKyc
);
export default router;
