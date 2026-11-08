
import express from "express";
import SoftwareAnalytics from "../model/SoftwareAnalytics.js";
import { protect, authorize } from "../middleware/auth.js";
import { ANALYTICS_PLATFORMS } from "../utils/analyticsPlatform.js";

const router = express.Router();

router.post("/download-click", async (req, res) => {
  try {
    const { platform, visitorId, source } = req.body ?? {};

    if (!ANALYTICS_PLATFORMS.includes(platform)) {
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

router.post("/app-first-open", async (req, res) => {
  try {
    const { platform, installationId, version, source } = req.body ?? {};

    if (!ANALYTICS_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid platform.",
      });
    }

    if (
      typeof installationId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,150}$/.test(installationId)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid installation ID is required.",
      });
    }

    const result = await SoftwareAnalytics.updateOne(
      { eventType: "app_first_open", installationId },
      {
        $setOnInsert: {
          eventType: "app_first_open",
          platform,
          installationId,
          version:
            typeof version === "string" ? version.slice(0, 50) : null,
          source:
            typeof source === "string"
              ? source.slice(0, 100)
              : "installed-app",
        },
      },
      { upsert: true },
    );

    return res.status(201).json({
      success: true,
      alreadyExists: !result.upsertedCount,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({
        success: true,
        alreadyExists: true,
      });
    }

    console.error("App first-open analytics error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to record app first open.",
    });
  }
});

/*
|--------------------------------------------------------------------------
| SUPER ADMIN: View analytics
|--------------------------------------------------------------------------
*/
router.get("/summary", protect, authorize("superadmin"), async (req, res) => {
  try {
    const results = await SoftwareAnalytics.aggregate([
      {
        $match: {
          eventType: {
            $in: [
              "download_clicked",
              "app_first_open",
              "account_created",
              "installation_activated",
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            eventType: "$eventType",
            platform: "$platform",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const emptyPlatformCounts = () => ({
      windows: 0,
      android: 0,
      ios: 0,
      macos: 0,
      linux: 0,
      other: 0,
    });

    const summary = {
      downloadClicks: {
        total: 0,
        byPlatform: emptyPlatformCounts(),
      },
      confirmedInstalls: {
        total: 0,
        byPlatform: emptyPlatformCounts(),
      },
      accountsCreated: {
        total: 0,
        byPlatform: emptyPlatformCounts(),
      },
    };

    for (const item of results) {
      const count = Number(item.count || 0);
      const { eventType, platform } = item._id;

      if (eventType === "download_clicked") {
        summary.downloadClicks.total += count;
        if (summary.downloadClicks.byPlatform[platform] !== undefined) {
          summary.downloadClicks.byPlatform[platform] += count;
        }
      }

      if (
        eventType === "app_first_open" ||
        eventType === "installation_activated"
      ) {
        summary.confirmedInstalls.total += count;
        if (summary.confirmedInstalls.byPlatform[platform] !== undefined) {
          summary.confirmedInstalls.byPlatform[platform] += count;
        }
      }

      if (eventType === "account_created") {
        summary.accountsCreated.total += count;
        if (summary.accountsCreated.byPlatform[platform] !== undefined) {
          summary.accountsCreated.byPlatform[platform] += count;
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ...summary,
        totalDownloads: summary.downloadClicks.total,
        windowsDownloads: summary.downloadClicks.byPlatform.windows,
        androidDownloads: summary.downloadClicks.byPlatform.android,
      },
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
