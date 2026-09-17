import express from "express";

import {
  getMyProfile,
  updateMyProfile,

} from "../../controllers/profileController.js";

import { authorize, protect  } from "../../middleware/auth.js";
const router = express.Router();

/*
|--------------------------------------------------------------------------
| CURRENT USER PROFILE
|--------------------------------------------------------------------------
*/
router.use(protect)
router.get(
  "/me",

  getMyProfile
);

router.put(
  "/me",

  updateMyProfile
);

/*
|--------------------------------------------------------------------------
| PASSWORD
|--------------------------------------------------------------------------
*/

// router.put(
//   "/me/password",
 
//   updateMyPassword
// );

export default router;