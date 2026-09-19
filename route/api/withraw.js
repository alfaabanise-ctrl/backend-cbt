import express from "express";

import {
  requestWithdrawal,
  approveWithdrawal, 
  rejectWithdrawal,
} from "../../controllers/withdraw.js";
import { getAllLedgerHistory } from "../../controllers/super-admin/ledger.js";
import { authorize, protect  } from "../../middleware/auth.js";

const router = express.Router();


// ============================================================
// ADMIN / TEACHER REQUEST WITHDRAWAL
// ============================================================

router.post(
  "/admin/wallet/withdraw",
  protect,
  authorize("admin", "teacher"),
  requestWithdrawal
);


// Optional general endpoint
router.post(
  "/withdraw",
  protect,
  authorize("admin", "teacher"),
  requestWithdrawal
);


// ============================================================
// SUPER ADMIN
// ============================================================

router.patch(
  "/superadmin/withdrawals/:withdrawalId/approve",
  protect,
  authorize("superadmin"),
  approveWithdrawal
);


router.patch(
  "/superadmin/withdrawals/:withdrawalId/reject",
  protect,
  authorize("superadmin"),
  rejectWithdrawal
);

router.get(
  "/ledgers",
  protect,
  getAllLedgerHistory
);
export default router;