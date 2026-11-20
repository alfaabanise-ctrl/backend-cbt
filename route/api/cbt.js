import express from "express"
import multer from "multer"
import {
  deleteCbtPaper,
  getCbtPaper,
getCbtPaperByAccessCode,
  listAdminCbtPapers,
  listCbtPapers,
  submitCbtAttempt,
 savePapers,
  uploadCbtImage,
} from "../../controllers/cbtController.js"
import { authorize, protect } from "../../middleware/auth.js"

const router = express.Router()
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.mimetype)) {
      const error = new Error("Upload a JPG, PNG, GIF or WebP image.")
      error.statusCode = 400
      return callback(error)
    }
    callback(null, true)
  },
})

function handleImageUpload(req, res, next) {
  imageUpload.single("image")(req, res, (error) => {
    if (!error) return next()

    const status = error.code === "LIMIT_FILE_SIZE"
      ? 413
      : Number(error.statusCode) || 400
    return res.status(status).json({
      success: false,
      message: status === 413 ? "Image must be 5 MB or smaller." : error.message,
    })
  })
}

router.get("/subjects", listCbtPapers)
router.get("/subjects/:id", getCbtPaper)
router.post("/attempt", protect, authorize("student"), submitCbtAttempt)

router.get("/admin/subjects", protect, authorize("admin", "superadmin"), listAdminCbtPapers)
router.post("/save", protect, authorize("admin", "superadmin"), savePapers)
router.post("/import", protect, authorize("admin", "superadmin"), savePapers)         // no params.id -> create/import
router.put("/subjects/:id", protect, authorize("admin", "superadmin"), savePapers) 
router.delete("/subjects/:id", protect, authorize("admin", "superadmin"), deleteCbtPaper)
router.get("/subjects/access/:accessCode", getCbtPaperByAccessCode)  // public access via access code
router.post(
  "/images",
  protect,
  authorize("admin", "superadmin"),
  handleImageUpload,
  uploadCbtImage
)

export default router
