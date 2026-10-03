import express from "express";

import {
  startDownload,
  downloadQuestions,
  downloadSubjects,
  downloadTopics,
  downloadLearning,
} from "../../controllers/contentDownload.js";

const router = express.Router();

router.post("/start", startDownload);

router.get("/questions", downloadQuestions);

router.get("/subjects", downloadSubjects);

router.get("/topics", downloadTopics);

router.get("/learning", downloadLearning);

export default router;