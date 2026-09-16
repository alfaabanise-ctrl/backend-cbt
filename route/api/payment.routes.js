
import express from "express";

import { protect, authprotect} from "../../middleware/auth.js";
import {
  createStudentPayment,
  verifyStudentPayment,
  getStudentPaymentStatus,
  getStudentPayment,
  verifyPendingPayments,
  validateRefund,
} from "../../controllers/payment.controller.js";


const router = express.Router();


/*
|--------------------------------------------------------------------------
| Student Payment
|--------------------------------------------------------------------------
*/
router.use(protect);
router.post(
  "/student/create",
  ,
  createStudentPayment
);


router.post(
  "/student/verify",
  
  verifyStudentPayment
);


router.get(
  "/student/status/:txRef",
  
  getStudentPaymentStatus
);


router.get(
  "/student/:txRef",
 
  getStudentPayment
);


/*
|--------------------------------------------------------------------------
| Admin Payment Operations
|--------------------------------------------------------------------------
*/

router.post(
  "/admin/verify-pending",
 
  verifyPendingPayments
);


router.post(
  "/admin/refund/validate",

  validateRefund
);


export default router;

