import express from "express"
import {handleNewUsers,resendOtp,  protectPages, verifyResetToken, resetPassword, requestPasswordReset,  verifyEmail} from "../../controllers/authController.js"
import { handleLogin,updatePassword, googleCallback, logout } from "../../controllers/handleLoginControl.js"
import { protect} from "../../middleware/auth.js";
import  {updatePropertySchema} from "../../validation/updateProperty.js"
import { validate } from "../../middleware/validate.js";
import { loginLimiter } from "../../middleware/rateLimiter.js";
const router = express.Router()

router.post("/register", handleNewUsers)
router.post("/verify-email", verifyEmail)
router.post("/resend-otp",  resendOtp)
router.post("/login/:authProvider",    loginLimiter,    handleLogin)
router.post("/request-password-reset",  requestPasswordReset)
router.post("/reset-password",  resetPassword)
router.get("/verify-reset-token", verifyResetToken)
router.get("/protected", protectPages)
router.get('/google/callback', googleCallback);
router.post('/logout', logout);
router.post('/update-password', protect,  updatePassword);
export default router