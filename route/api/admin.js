
import express from "express";

import {
  getAdminDashboard,
} from "../../controllers/admin/dashboard.js";
import { getPaymentsadmin } from "../../controllers/super-admin/payment.js";

import {  getWalletDashboard,
  getWalletTransactions,
  getWalletWithdrawals,
  getWithdrawal,
  requestWithdrawal, } from "../../controllers/admin/wallet.js";
import {getTeachers, getStudents, getTeacherStudents } from  "../../controllers/admin/index.js";
import { authorize, protect  } from "../../middleware/auth.js";

const router = express.Router();


router.use(protect);
// router.use(authorize("superadmin"));
/*
|--------------------------------------------------------------------------
| ADMIN DASHBOARD
|--------------------------------------------------------------------------
|
| GET /admin/dashboard
|
| Your existing authMiddleware is only responsible for identifying
| the logged-in user and putting it into req.user.
|
| The controller then loads ONLY that admin's data.
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  
  getAdminDashboard
);

router.get(
  '/teachers',
  getTeachers
)

router.get(
  '/students',
  getStudents
)

router.get(
  '/payments',
  getPaymentsadmin
)






router.get(
  "/wallet",
  getWalletDashboard
);

/*
|--------------------------------------------------------------------------
| Transactions
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet/transactions
|
*/

router.get(
  "/transactions",
  getWalletTransactions
);

/*
|--------------------------------------------------------------------------
| Withdrawals
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet/withdrawals
|
*/

router.get(
  "/withdrawals",
  getWalletWithdrawals
);

/*
|--------------------------------------------------------------------------
| One withdrawal
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet/withdrawals/:withdrawalId
|
*/

router.get(
  "/withdrawals/:withdrawalId",
  getWithdrawal
);

/*
|--------------------------------------------------------------------------
| Request withdrawal
|--------------------------------------------------------------------------
|
| POST /api/admin/wallet/withdrawals
|
*/

router.post(
  "/withdrawals",
  requestWithdrawal
);


export default router;

