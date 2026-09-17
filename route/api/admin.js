
import express from "express";

import {
  getAdminDashboard,
} from "../../controllers/admin/dashboard.js";
import { getPaymentsadmin } from "../../controllers/super-admin/payment.js";
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



export default router;

