
import express from "express";

import PaymentController from "../../controllers/payment.controller.js";


import { authorize, protect  } from "../../middleware/auth.js";

const router = express.Router();


/*
|--------------------------------------------------------------------------
| Initialize Payment
|--------------------------------------------------------------------------
*/
router.use(protect)
router.post(
  "/initialize",
  
  PaymentController.initializePayment
);


/*
|--------------------------------------------------------------------------
| Verify Paystack Payment
|--------------------------------------------------------------------------
*/

router.post(
  "/verify",
 
  PaymentController.verifyPayment
);


router.get(
  "/history",
 
  PaymentController.PaymentHistory
);

/*
|--------------------------------------------------------------------------
| Get Payment
|--------------------------------------------------------------------------
*/

router.get(
  "/:txRef",
 
  PaymentController.getPayment
);


/*
|--------------------------------------------------------------------------
| Get Payment Status
|--------------------------------------------------------------------------
*/

router.get(
  "/:txRef/status",
  
  PaymentController.getPaymentStatus
);


/*
|--------------------------------------------------------------------------
| Verify Pending Payments
|--------------------------------------------------------------------------
*/

router.post(
  "/verify-pending",
 
  PaymentController.verifyPendingPayments
);


/*
|--------------------------------------------------------------------------
| Validate Refund
|--------------------------------------------------------------------------
*/

router.post(
  "/refund/validate",
  
  PaymentController.validateRefund
);




export default router;
