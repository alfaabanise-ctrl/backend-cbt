import mongoose from "mongoose";

import SoftwareToken from "../models/softwareToken.js";
import Usercbt from "../models/user.js";

import { Subject } from "../models/subject.js";
import { Topic } from "../models/topic.js";
import { Lesson } from "../models/lesson.js";

// Change this import to your actual PastQuestion model
import PastQuestion from "../models/pastQuestion.js";

// ============================================================
// HELPERS
// ============================================================

const normalizeToken = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase();
};

const normalizeSystemId = (value) => {
  return String(value || "").trim();
};

const calculateExpiryDate = (plan, startDate = new Date()) => {
  const expiresAt = new Date(startDate);

  switch (plan) {
    case "Monthly":
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      break;

    case "Quarterly":
      expiresAt.setMonth(expiresAt.getMonth() + 3);
      break;

    case "Yearly":
    default:
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      break;
  }

  return expiresAt;
};

const isExpired = (expiresAt) => {
  if (!expiresAt) return false;

  return new Date(expiresAt).getTime() <= Date.now();
};

// ============================================================
// ACTIVATE TOKEN
// POST /api/software-tokens/activate
// ============================================================

export const activateSoftwareToken = async (req, res) => {
  try {
    const userId = req.user?._id;

    const { token, systemId } = req.body;

    // ----------------------------------------------------------
    // VALIDATION
    // ----------------------------------------------------------

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token is required.",
      });
    }

    if (!systemId) {
      return res.status(400).json({
        success: false,
        message: "System ID is required.",
      });
    }

    const normalizedToken = normalizeToken(token);
    const normalizedSystemId = normalizeSystemId(systemId);

    if (!normalizedSystemId) {
      return res.status(400).json({
        success: false,
        message: "Invalid system ID.",
      });
    }

    // ----------------------------------------------------------
    // GET USER
    // ----------------------------------------------------------

    const user = await Usercbt.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student account not found.",
      });
    }

    if (user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can activate software tokens.",
      });
    }

    if (user.status !== "Active") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active.",
      });
    }

    // ----------------------------------------------------------
    // FIND TOKEN
    // ----------------------------------------------------------

    const softwareToken = await SoftwareToken.findOne({
      token: normalizedToken,
    });

    if (!softwareToken) {
      return res.status(404).json({
        success: false,
        message: "Invalid software token.",
      });
    }

    // ----------------------------------------------------------
    // REVOKED
    // ----------------------------------------------------------

    if (softwareToken.status === "revoked") {
      return res.status(403).json({
        success: false,
        message: "This token has been revoked.",
      });
    }

    // ----------------------------------------------------------
    // ALREADY EXPIRED
    // ----------------------------------------------------------

    if (isExpired(softwareToken.expiresAt)) {
      softwareToken.status = "expired";

      await softwareToken.save();

      return res.status(403).json({
        success: false,
        message: "This token has expired.",
      });
    }

    // ----------------------------------------------------------
    // TOKEN BELONGS TO ANOTHER STUDENT
    // ----------------------------------------------------------

    if (
      softwareToken.owner &&
      softwareToken.owner.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "This token belongs to another student.",
      });
    }

    // ----------------------------------------------------------
    // TOKEN ALREADY ACTIVE
    // ----------------------------------------------------------

    if (softwareToken.status === "active") {
      // Same student + same device
      if (
        softwareToken.activatedBy?.toString() ===
          userId.toString() &&
        softwareToken.systemId === normalizedSystemId
      ) {
        return res.status(200).json({
          success: true,
          alreadyActivated: true,
          message: "Token is already activated on this device.",
          data: {
            activation: {
              tokenId: softwareToken._id,
              product: softwareToken.product,
              plan: softwareToken.plan,
              systemId: softwareToken.systemId,
              activatedAt: softwareToken.activatedAt,
              expiresAt: softwareToken.expiresAt,
              status: softwareToken.status,
            },
          },
        });
      }

      // Token is already being used by another device
      if (
        softwareToken.systemId &&
        softwareToken.systemId !== normalizedSystemId
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This token is already activated on another device.",
        });
      }

      // Another account activated it
      if (
        softwareToken.activatedBy &&
        softwareToken.activatedBy.toString() !== userId.toString()
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This token has already been activated by another student.",
        });
      }
    }

    // ----------------------------------------------------------
    // DEVICE LIMIT
    // ----------------------------------------------------------

    if (
      softwareToken.deviceLimit <= softwareToken.deviceCount &&
      softwareToken.status !== "active"
    ) {
      return res.status(409).json({
        success: false,
        message: "This token has reached its device limit.",
      });
    }

    // ----------------------------------------------------------
    // ACTIVATE
    // ----------------------------------------------------------

    const now = new Date();

    const expiresAt =
      softwareToken.expiresAt ||
      calculateExpiryDate(softwareToken.plan, now);

    softwareToken.owner = userId;
    softwareToken.activatedBy = userId;
    softwareToken.activatedAt = now;
    softwareToken.expiresAt = expiresAt;
    softwareToken.systemId = normalizedSystemId;
    softwareToken.deviceCount =
      Math.max(softwareToken.deviceCount || 0, 1);
    softwareToken.status = "active";

    await softwareToken.save();

    // ----------------------------------------------------------
    // UPDATE USER
    // ----------------------------------------------------------

    user.softwareToken = softwareToken._id;

    await user.save();

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Token activated successfully.",
      data: {
        activation: {
          tokenId: softwareToken._id,
          product: softwareToken.product,
          plan: softwareToken.plan,
          systemId: softwareToken.systemId,
          activatedAt: softwareToken.activatedAt,
          expiresAt: softwareToken.expiresAt,
          status: softwareToken.status,
          features: softwareToken.features,
        },
      },
    });
  } catch (error) {
    console.error(
      "activateSoftwareToken error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to activate software token.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

// ============================================================
// VERIFY TOKEN
// POST /api/software-tokens/verify
// ============================================================

export const verifySoftwareToken = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { systemId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!systemId) {
      return res.status(400).json({
        success: false,
        message: "System ID is required.",
      });
    }

    const softwareToken = await SoftwareToken.findOne({
      activatedBy: userId,
      systemId: normalizeSystemId(systemId),
    });

    if (!softwareToken) {
      return res.status(404).json({
        success: false,
        active: false,
        message:
          "No active token was found for this device.",
      });
    }

    // ----------------------------------------------------------
    // REVOKED
    // ----------------------------------------------------------

    if (softwareToken.status === "revoked") {
      return res.status(403).json({
        success: false,
        active: false,
        message: "Your token has been revoked.",
      });
    }

    // ----------------------------------------------------------
    // EXPIRED
    // ----------------------------------------------------------

    if (isExpired(softwareToken.expiresAt)) {
      softwareToken.status = "expired";

      await softwareToken.save();

      return res.status(403).json({
        success: false,
        active: false,
        message: "Your token has expired.",
      });
    }

    // ----------------------------------------------------------
    // STATUS
    // ----------------------------------------------------------

    if (softwareToken.status !== "active") {
      return res.status(403).json({
        success: false,
        active: false,
        message: "Your token is not active.",
      });
    }

    // ----------------------------------------------------------
    // SUCCESS
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,
      active: true,
      message: "Token is valid.",
      data: {
        activation: {
          tokenId: softwareToken._id,
          product: softwareToken.product,
          plan: softwareToken.plan,
          systemId: softwareToken.systemId,
          activatedAt: softwareToken.activatedAt,
          expiresAt: softwareToken.expiresAt,
          status: softwareToken.status,
          features: softwareToken.features,
        },
      },
    });
  } catch (error) {
    console.error(
      "verifySoftwareToken error:",
      error
    );

    return res.status(500).json({
      success: false,
      active: false,
      message: "Failed to verify token.",
    });
  }
};