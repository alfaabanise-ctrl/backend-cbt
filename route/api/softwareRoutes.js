import express from "express";

import {
  activateSoftware,
  getInstallationStatus,
} from "../../controllers/softwareController.js";

import {
  requireSoftwareAuthentication,
} from "../../middleware/softwareAuth.js";

const router = express.Router();

/*
 * PUBLIC ACTIVATION
 *
 * No student account.
 * No login required.
 */
router.post(
  "/activate",
  activateSoftware
);

/*
 * PROTECTED INSTALLATION STATUS
 */
router.get(
  "/status",
  requireSoftwareAuthentication,
  getInstallationStatus
);

export default router;