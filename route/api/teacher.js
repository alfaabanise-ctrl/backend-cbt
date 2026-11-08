import express from "express";

import {
  getTeacherDashboard, getStudents
} from "../../controllers/teacher/index.js";

import { authorize, protect  } from "../../middleware/auth.js";
import { resetSoftwareDevice } from "../../controllers/softwareController.js";
import rateLimit from "express-rate-limit";
const router =
  express.Router();
const deviceResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/*
|--------------------------------------------------------------------------
| TEACHER DASHBOARD
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  protect,
  authorize("teacher"),
  getTeacherDashboard
);

router.get(
  "/students",
  protect,
  authorize("teacher"),
  getStudents
);

router.post(
  "/software/:tokenId/reset-device",
  protect,
  authorize("teacher"),
  deviceResetLimiter,
  resetSoftwareDevice,
);


export default router;