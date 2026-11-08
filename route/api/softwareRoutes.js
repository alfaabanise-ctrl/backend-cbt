import express from "express";

import {
  activateSoftware,
  getInstallationStatus,
} from "../../controllers/softwareController.js";

import {
  requireSoftwareAuthentication,
} from "../../middleware/softwareAuth.js";
import { authorize, protect } from "../../middleware/auth.js";
import {
  completePwaActivation,
  getPwaActivationOptions,
  listPwaInstallations,
  revokePwaInstallation,
} from "../../controllers/pwaActivationController.js";
import rateLimit from "express-rate-limit";

const router = express.Router();
const pwaActivationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    code: "ACTIVATION_RATE_LIMITED",
    message: "Too many activation attempts. Please wait and try again.",
  },
});

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

router.post(
  "/pwa/options",
  pwaActivationLimiter,
  getPwaActivationOptions,
);
router.post(
  "/pwa/verify",
  pwaActivationLimiter,
  completePwaActivation,
);

/*
 * PROTECTED INSTALLATION STATUS
 */
router.get(
  "/status",
  requireSoftwareAuthentication,
  getInstallationStatus
);

router.get(
  "/admin/pwa/:tokenId/installations",
  protect,
  authorize("superadmin"),
  listPwaInstallations,
);
router.post(
  "/admin/pwa/installations/:installationId/revoke",
  protect,
  authorize("superadmin"),
  revokePwaInstallation,
);

export default router;