
import express from "express";
import multer from "multer";

import {
  getAdminDashboard,
} from "../../controllers/admin/dashboard.js";
import { getPaymentsadmin } from "../../controllers/super-admin/payment.js";

import {  getWalletDashboard,
  getWalletTransactions,
  getWalletWithdrawals,
  getWithdrawal,
  requestWithdrawal, } from "../../controllers/admin/wallet.js";
import {getTeachers, getStudents, getTeacherStudents } from  "../../controllers/admin/index.js";
import { authorize, protect  } from "../../middleware/auth.js";
import {
  createExamMedia,
  createOrUpdateExamAnswer,
  createExamPaper,
  createExamQuestion,
  deleteExamPaper,
  deleteExamQuestion,
  getExamMedia,
  getExamPaper,
  listExamPapers,
  listExamMedia,
  listExamQuestions,
  updateExamMedia,
  updateExamAnswer,
  updateExamPaper,
  updateExamQuestion,
  uploadExamMedia,
} from "../../controllers/admin/examController.js";
import {
  listExamImportSubjects,
  previewExamPaperImport,
  saveExamPaperImport,
} from "../../controllers/admin/examImportController.js";

const router = express.Router();
const examImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(new Error("Only PNG, JPG, and WebP images are supported."));
    }
    return callback(null, true);
  },
}).single("file");
const examImportImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter(req, file, callback) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(new Error("Only PNG, JPG, and WebP images are supported."));
    }
    return callback(null, true);
  },
}).array("images", 5);

const handleExamImageUpload = (req, res, next) => {
  examImageUpload(req, res, (error) => {
    if (error) {
      return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        success: false,
        message: error.message,
      });
    }
    return next();
  });
};

const handleExamImportImagesUpload = (req, res, next) => {
  examImportImagesUpload(req, res, (error) => {
    if (error) {
      return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        success: false,
        message: error.message,
      });
    }
    return next();
  });
};


router.use(protect);
// router.use(authorize("superadmin"));

router.use("/exams", authorize("admin", "superadmin"));
/*
|--------------------------------------------------------------------------
| ADMIN DASHBOARD
|--------------------------------------------------------------------------
|
| GET /admin/dashboard
|
| Your existing authMiddleware is only responsible for identifying
| the logged-in user and putting it into req.user.
|
| The controller then loads ONLY that admin's data.
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  
  getAdminDashboard
);

router.get(
  '/teachers',
  getTeachers
)

router.get(
  '/students',
  getStudents
)

router.get(
  '/payments',
  getPaymentsadmin
)






router.get(
  "/wallet",
  getWalletDashboard
);

/*
|--------------------------------------------------------------------------
| Transactions
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet/transactions
|
*/

router.get(
  "/transactions",
  getWalletTransactions
);

/*
|--------------------------------------------------------------------------
| Withdrawals
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet/withdrawals
|
*/

router.get(
  "/withdrawals",
  getWalletWithdrawals
);

/*
|--------------------------------------------------------------------------
| One withdrawal
|--------------------------------------------------------------------------
|
| GET /api/admin/wallet/withdrawals/:withdrawalId
|
*/

router.get(
  "/withdrawals/:withdrawalId",
  getWithdrawal
);

/*
|--------------------------------------------------------------------------
| Request withdrawal
|--------------------------------------------------------------------------
|
| POST /api/admin/wallet/withdrawals
|
*/

router.post(
  "/withdrawals",
  requestWithdrawal
);

router.post(
  "/exams/import/preview",
  handleExamImportImagesUpload,
  previewExamPaperImport
);
router.get("/exams/subjects", listExamImportSubjects);
router.post(
  "/exams/import/save",
  handleExamImportImagesUpload,
  saveExamPaperImport
);

router.get("/exams/papers", listExamPapers);
router.post("/exams/papers", createExamPaper);
router.get("/exams/papers/:paperId", getExamPaper);
router.put("/exams/papers/:paperId", updateExamPaper);
router.delete("/exams/papers/:paperId", deleteExamPaper);

router.get("/exams/questions", listExamQuestions);
router.post("/exams/questions", createExamQuestion);
router.put("/exams/questions/:questionId", updateExamQuestion);
router.delete("/exams/questions/:questionId", deleteExamQuestion);

router.post("/exams/answers", createOrUpdateExamAnswer);
router.put("/exams/answers/:questionId", updateExamAnswer);

router.get("/exams/media", listExamMedia);
router.get("/exams/media/:mediaId", getExamMedia);
router.post("/exams/media", createExamMedia);
router.post("/exams/media/upload", handleExamImageUpload, uploadExamMedia);
router.put("/exams/media/:mediaId", updateExamMedia);

export default router;

