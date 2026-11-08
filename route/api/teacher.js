import express from "express";

import {
  getTeacherDashboard, getStudents
} from "../../controllers/teacher/index.js";

import { authorize, protect  } from "../../middleware/auth.js";
const router =
  express.Router();

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


export default router;