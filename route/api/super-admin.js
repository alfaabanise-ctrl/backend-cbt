import express from "express";

import {getAdmins, getAdmin, getTeachers, getStudents} from "../../controllers/super-admin/admin.controller.js";
import { getPayments, } from "../../controllers/super-admin/payment.js";
// Use your existing authentication middleware here
import { authorize, protect  } from "../../middleware/auth.js";
import {
  getSuperAdminDashboard,
} from "../../controllers/super-admin/dashbord.js";
import {
  getAllWallets,
  getWalletStatistics,
  getWalletById,
} from "../../controllers/super-admin/wallet.controller.js";
import { resetSoftwareDevice } from "../../controllers/softwareController.js";
import rateLimit from "express-rate-limit";
const router = express.Router();
const deviceResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/*
|--------------------------------------------------------------------------
| Superadmin → Admins
|--------------------------------------------------------------------------
*/
router.use(protect);
router.use(authorize("superadmin"));
// Create Admin


// Get all Admins
router.get( "/admin", getAdmins);
// Get all Teacher
router.get( "/teachers", getTeachers);


router.get( "/students", getStudents);
router.post(
  "/software/:tokenId/reset-device",
  deviceResetLimiter,
  resetSoftwareDevice,
);
// Get one Admin + Teachers + Students
router.get( "/payments", getPayments);


/// WALLET
router.get(
  "/wallets",
  getAllWallets
);


router.get(
  "/wallets/statistics",
  getWalletStatistics
);
router.get(
  "/dashboard",
  getSuperAdminDashboard
);

router.get(
  "/wallet/:walletId",
  getWalletById
);





export default router;