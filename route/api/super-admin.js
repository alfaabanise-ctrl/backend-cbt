import express from "express";

import {getAdmins, getAdmin, getTeachers, getStudents} from "../../controllers/super-admin/admin.controller.js";
import { getPayments, } from "../../controllers/super-admin/payment.js";
// Use your existing authentication middleware here
import { authorize, protect  } from "../../middleware/auth.js";

const router = express.Router();

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
// Get one Admin + Teachers + Students
router.get( "/payments", getPayments);

router.get( "/:adminId", getAdmin);


// Change Admin Status

export default router;