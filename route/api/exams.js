import express from "express";
import { requireSoftwareAuthentication } from "../../middleware/softwareAuth.js";
import {
  getPublishedExamQuestions,
  listPublishedExamPapers,
} from "../../controllers/examController.js";

const router = express.Router();

router.use(requireSoftwareAuthentication);
router.get("/papers", listPublishedExamPapers);
router.get("/papers/:paperId/questions", getPublishedExamQuestions);

export default router;
