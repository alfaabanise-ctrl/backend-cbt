import express from "express";

import {
  bindSoftwareDevice,
  activateSoftware,
  getInstallationStatus,
} from "../../controllers/softwareController.js";

import {
  requireSoftwareAuthentication,
} from "../../middleware/softwareAuth.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

const activationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many activation attempts. Please try again later.",
    code: "ACTIVATION_RATE_LIMITED",
  },
});
const bindingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/*
 * PUBLIC ACTIVATION
 *
 * No student account.
 * No login required.
 */
router.post(
  "/activate",
  activationLimiter,
  activateSoftware
);

router.post(
  "/bind-device",
  bindingLimiter,
  requireSoftwareAuthentication,
  bindSoftwareDevice,
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