// route/api/appRelease.js  (ES module, stores releases in MongoDB)
import express from "express";
import mongoose from "mongoose";
import { authorize, protect  } from "../../middleware/auth.js";
const router = express.Router();

const releaseSchema = new mongoose.Schema(
  {
    platform: { type: String, default: "android", index: true },
    versionCode: { type: Number, required: true },
    versionName: { type: String, required: true },
    apkUrl: { type: String, required: true },
    notes: { type: String, default: "" },
    force: { type: Boolean, default: false },
  },
  { timestamps: true }
);
releaseSchema.index({ platform: 1, versionCode: 1 }, { unique: true });

const AppRelease =
  mongoose.models.AppRelease || mongoose.model("AppRelease", releaseSchema);




  router.get("/latest", async (req, res) => {
  try {
    const platform = req.query.platform || "android";
    const latest = await AppRelease.findOne({ platform })
      .sort({ versionCode: -1 })
      .lean();

    if (!latest) {
      return res.status(404).json({ success: false, message: "No release yet" });
    }

    res.json({
      versionCode: latest.versionCode,
      versionName: latest.versionName,
      apkUrl: latest.apkUrl,
      notes: latest.notes || "",
      force: Boolean(latest.force),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.use(protect)
// TODO: swap for your real super-admin middleware if you prefer.
// For now a secret key in .env protects the publish route.
// ADMIN: edit an existing release (link, notes, name, force)
router.put("/release/:id", authorize("superadmin"), async (req, res) => {
  try {
    const { versionName, apkUrl, notes, force } = req.body;

    if (!versionName || !apkUrl) {
      return res.status(400).json({
        success: false,
        message: "versionName and apkUrl are required",
      });
    }
    if (!/^https:\/\//.test(apkUrl)) {
      return res
        .status(400)
        .json({ success: false, message: "apkUrl must start with https://" });
    }

    const release = await AppRelease.findByIdAndUpdate(
      req.params.id,
      { versionName, apkUrl, notes: notes || "", force: Boolean(force) },
      { new: true }
    );

    if (!release) {
      return res.status(404).json({ success: false, message: "Release not found" });
    }

    res.json({ success: true, message: "Release updated", release });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/release/:id", authorize("superadmin"), async (req, res) => {
  try {
    const release = await AppRelease.findByIdAndDelete(req.params.id);

    if (!release) {
      return res.status(404).json({
        success: false,
        message: "Release not found",
      });
    }

    res.json({
      success: true,
      message: "Release deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
// GET /api/app/latest?platform=android   (called by the mobile app)

// GET /api/app/releases   (admin: list all releases)
router.get("/releases", authorize("superadmin"), async (_req, res) => {
  try {
    res.json(await AppRelease.find().sort({ versionCode: -1 }).lean());
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/app/release   (admin: publish a new release)
// body: { versionCode, versionName, apkUrl, notes?, force?, platform? }
router.post("/release", authorize("superadmin"), async (req, res) => {
  try {
    const { versionCode, versionName, apkUrl, notes, force, platform } = req.body;

    if (!Number.isInteger(versionCode) || !versionName || !apkUrl) {
      return res.status(400).json({
        success: false,
        message: "versionCode (integer), versionName and apkUrl are required",
      });
    }
    if (!/^https:\/\//.test(apkUrl)) {
      return res
        .status(400)
        .json({ success: false, message: "apkUrl must start with https://" });
    }

    await AppRelease.create({
      platform: platform || "android",
      versionCode,
      versionName,
      apkUrl,
      notes: notes || "",
      force: Boolean(force),
    });

    res.status(201).json({ success: true, message: "Release published" });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "That versionCode already exists" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;