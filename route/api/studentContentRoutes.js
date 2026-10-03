import express from "express";

import {
  requireSoftwareAuthentication,
} from "../../middleware/softwareAuth.js";

import {
  getSoftwareSubjects,
  getSoftwareTopics,
  getSoftwareLessons,
  getSoftwarePastQuestions,
} from "../../controllers/studentContentController.js";

const router = express.Router();

/*
 * EVERYTHING BELOW THIS POINT
 * requires an activated Abanise installation.
 */

router.get(
  "/subjects",
  requireSoftwareAuthentication,
  getSoftwareSubjects
);

router.get(
  "/topics",
  requireSoftwareAuthentication,
  getSoftwareTopics
);

router.get(
  "/lessons",
  requireSoftwareAuthentication,
  getSoftwareLessons
);

router.get(
  "/past-questions",
  requireSoftwareAuthentication,
  getSoftwarePastQuestions
);

export default router;