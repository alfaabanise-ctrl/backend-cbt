
import express from "express";
import mongoose from "mongoose";
import SoftwareAnalytics from "../model/SoftwareAnalytics.js";

const router = express.Router();

const validPlatforms = ["windows", "android"];




router.post("/download-click", async (req, res) => {
  try {
    const { platform, visitorId, source } = req.body ?? {};

    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid platform.",
      });
    }

    const safeVisitorId =
      typeof visitorId === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(visitorId)
        ? visitorId
        : null;

    // Check whether this visitor has already recorded
    // a download click for this platform.
    if (safeVisitorId) {
      const existingDownload = await SoftwareAnalytics.findOne({
        eventType: "download_clicked",
        visitorId: safeVisitorId,
        platform,
      }).lean();

      if (existingDownload) {
        return res.status(200).json({
          success: true,
          message: "Download click already recorded.",
          alreadyExists: true,
        });
      }
    }

    await SoftwareAnalytics.create({
      eventType: "download_clicked",
      platform,
      visitorId: safeVisitorId,
      source:
        typeof source === "string"
          ? source.slice(0, 100)
          : "website",
    });

    return res.status(201).json({
      success: true,
      message: "Download click recorded.",
      alreadyExists: false,
    });
  } catch (error) {
    console.error("Download analytics error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to record download click.",
    });
  }
});


/*
|--------------------------------------------------------------------------
| ADMIN: View analytics
|--------------------------------------------------------------------------
|
| Replace this placeholder with your EXISTING admin authentication
| middleware. Do not expose this route publicly.
|
*/

// Import your real middleware, for example:
// import { protect, adminOnly } from "../middleware/auth.js";

router.get("/summary", async (req, res) => {
  try {
    const results = await SoftwareAnalytics.aggregate([
      {
        $match: {
          eventType: "download_clicked",
        },
      },
      {
        $group: {
          _id: "$platform",
          count: { $sum: 1 },
        },
      },
    ]);

    const downloads = {
      totalDownloads: 0,
      windowsDownloads: 0,
      androidDownloads: 0,
    };

    for (const item of results) {
      const count = Number(item.count || 0);

      if (item._id === "windows") {
        downloads.windowsDownloads = count;
      }

      if (item._id === "android") {
        downloads.androidDownloads = count;
      }

      downloads.totalDownloads += count;
    }

    return res.status(200).json({
      success: true,
      data: downloads,
    });
  } catch (error) {
    console.error("Software download summary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load software download statistics.",
    });
  }
});

export default router;
