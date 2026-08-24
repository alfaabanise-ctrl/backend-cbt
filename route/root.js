import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Routes
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "index.html"));
});

router.get("/test(.html)?", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "test.html"));
});

router.get("/redirect(.html)?", (req, res) => {
  res.redirect(301, "/test.html");
});

export default router;