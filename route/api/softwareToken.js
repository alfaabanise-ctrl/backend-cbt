import express from "express";

import {
  getMySoftwareTokens,
  
} from "../../controllers/softwareToken.controller.js";

import { authorize, protect  } from "../../middleware/auth.js";
const router = express.Router();

/*
|--------------------------------------------------------------------------
| Student Software Tokens
|--------------------------------------------------------------------------
*/
router.use(protect)
router.get(
  "/softwareTokens",

  getMySoftwareTokens
);



export default router;