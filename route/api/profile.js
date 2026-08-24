import express from "express";
const router = express.Router()
import { updateAvater, getUserByIdForOgImg, updateogImage, getAgentSitemap, getpropertybyUser, getAllAgents, getAgent, getAvatar, sendSMS,  getuser, updateProfile } from "../../controllers/profile.js";
import { protect} from "../../middleware/auth.js";
import uploadAvatar from "../../middleware/upload.js"
import { validate } from "../../middleware/validate.js";
import { updateProfileSchema } from "../../validation/updateProfile.js";

router.post("/upload-avatar", protect,  uploadAvatar.single("avatar"), updateAvater);
router.get("/avatar", protect, getAvatar);
router.post("/update", protect,  updateProfile)
router.get("/me", protect, getuser)
router.get("/agents", getAllAgents)
router.get("/property", protect, getpropertybyUser)
router.post("/sendsms", protect, sendSMS)
router.post('/upload-og',  protect,  updateogImage)

router.get("/agents/:id", getAgent)
router.get("/og/:id",   getUserByIdForOgImg);
router.get("/sitemap", getAgentSitemap)
export default router;


