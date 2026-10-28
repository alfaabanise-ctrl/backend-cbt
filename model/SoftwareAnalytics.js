
import mongoose from "mongoose";

const softwareAnalyticsSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: [
        "download_clicked",
        "installation_activated",
      ],
      required: true,
      index: true,
    },

    platform: {
      type: String,
      enum: ["windows", "android"],
      required: true,
      index: true,
    },

    visitorId: {
      type: String,
      default: null,
      maxlength: 100,
    },

    installationId: {
      type: String,
      default: null,
      maxlength: 150,
    },

    version: {
      type: String,
      default: null,
      maxlength: 50,
    },

    source: {
      type: String,
      default: "website",
      maxlength: 100,
    },
  },
  { timestamps: true }
);

softwareAnalyticsSchema.index({ createdAt: -1 });

softwareAnalyticsSchema.index(
  { installationId: 1, eventType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      eventType: "installation_activated",
      installationId: { $type: "string" },
    },
  }
);

export default mongoose.model(
  "SoftwareAnalytics",
  softwareAnalyticsSchema
);
