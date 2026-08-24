import express from "express"

import {
  getSidebar,
  getLesson,
  getAdjacentLesson,
  getLessonById,
  updateLesson,
  searchLessons,
  importCurriculum
} from "../../controllers/lessonController.js"

const router = express.Router()

router.get(
  "/sidebar",
  getSidebar
)

router.get(
  "/search",
  searchLessons
)

router.get(
  "/adjacent",
  getAdjacentLesson
)
router.get(
  "/id/:lessonId",
  getLessonById
)
router.get(
  "/:slug",
  getLesson
)


router.post(
  "/import",
  importCurriculum
)


router.put(
  "/:lessonId",
  updateLesson
)

export default router