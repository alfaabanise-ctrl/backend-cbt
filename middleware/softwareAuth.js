import crypto from "node:crypto";

import SoftwareInstallation from "../model/SoftwareInstallation.js";
import SoftwareToken from "../model/SoftwareToken.js";
import SoftwareNonce from "../model/SoftwareNonce.js";

import {
  createSignaturePayload,
  hashBody,
  verifyEd25519Signature,
} from "../utils/signature.js";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Normalize.
 */
function clean(value) {
  return String(value || "").trim();
}

/**
 * Get request body exactly enough for hashing.
 *
 * IMPORTANT:
 * Frontend must use the same JSON representation.
 */
function getRawBodyForSignature(req) {
  if (
    req.body === undefined ||
    req.body === null
  ) {
    return "";
  }

  return JSON.stringify(req.body);
}

/**
 * Protected software API.
 */
export const requireSoftwareAuthentication =
  async (req, res, next) => {
    try {
      const systemId = clean(
        req.get("X-Device-ID")
      );

      const timestamp = clean(
        req.get("X-Timestamp")
      );

      const nonce = clean(
        req.get("X-Nonce")
      );

      const signature = clean(
        req.get("X-Signature")
      );

      /*
       * Required headers.
       */
      if (!systemId) {
        return res.status(401).json({
          success: false,
          message: "Device authentication required.",
          code: "DEVICE_ID_REQUIRED",
        });
      }

      if (!timestamp) {
        return res.status(401).json({
          success: false,
          message: "Request timestamp is required.",
          code: "TIMESTAMP_REQUIRED",
        });
      }

      if (!nonce) {
        return res.status(401).json({
          success: false,
          message: "Request nonce is required.",
          code: "NONCE_REQUIRED",
        });
      }

      if (!signature) {
        return res.status(401).json({
          success: false,
          message: "Request signature is required.",
          code: "SIGNATURE_REQUIRED",
        });
      }

      /*
       * Validate timestamp.
       */
      const timestampNumber =
        Number(timestamp);

      if (
        !Number.isFinite(timestampNumber)
      ) {
        return res.status(401).json({
          success: false,
          message: "Invalid request timestamp.",
          code: "INVALID_TIMESTAMP",
        });
      }

      /*
       * Accept milliseconds OR seconds.
       */
      const requestTime =
        timestampNumber < 10000000000
          ? timestampNumber * 1000
          : timestampNumber;

      const timeDifference =
        Math.abs(Date.now() - requestTime);

      if (
        timeDifference > MAX_CLOCK_SKEW_MS
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Request timestamp has expired.",
          code: "TIMESTAMP_EXPIRED",
        });
      }

      /*
       * Find installation.
       */
      const installation =
        await SoftwareInstallation.findOne({
          systemId,
          status: "active",
        });

      if (!installation) {
        return res.status(403).json({
          success: false,
          message:
            "This device is not an activated Abanise installation.",
          code: "INSTALLATION_NOT_FOUND",
        });
      }

      /*
       * Find license.
       */
      const license =
        await SoftwareToken.findById(
          installation.softwareToken
        );

      if (!license) {
        return res.status(403).json({
          success: false,
          message:
            "Software license could not be found.",
          code: "LICENSE_NOT_FOUND",
        });
      }

      /*
       * License revoked.
       */
      if (license.status === "revoked") {
        return res.status(403).json({
          success: false,
          message:
            "This software license has been revoked.",
          code: "LICENSE_REVOKED",
        });
      }

      /*
       * License expired.
       */
      if (
        license.expiresAt &&
        new Date(
          license.expiresAt
        ).getTime() <= Date.now()
      ) {
        if (
          license.status !== "expired"
        ) {
          await SoftwareToken.updateOne(
            { _id: license._id },
            {
              $set: {
                status: "expired",
              },
            }
          );
        }

        return res.status(403).json({
          success: false,
          message:
            "This software license has expired.",
          code: "LICENSE_EXPIRED",
          expiresAt: license.expiresAt,
        });
      }

      /*
       * Must be active.
       */
      if (license.status !== "active") {
        return res.status(403).json({
          success: false,
          message:
            "This software license is not active.",
          code: "LICENSE_NOT_ACTIVE",
        });
      }

      /*
       * Prevent replay.
       *
       * Try to create nonce.
       *
       * If duplicate, request was already used.
       */
      try {
        await SoftwareNonce.create({
          nonce,
          installation: installation._id,
          expiresAt: new Date(
            Date.now() + MAX_CLOCK_SKEW_MS
          ),
        });
      } catch (nonceError) {
        if (
          nonceError?.code === 11000
        ) {
          return res.status(409).json({
            success: false,
            message:
              "This request has already been used.",
            code: "NONCE_ALREADY_USED",
          });
        }

        throw nonceError;
      }

      /*
       * Create body hash.
       */
      const rawBody =
        getRawBodyForSignature(req);

      const bodyHash =
        hashBody(rawBody);

      /*
       * Exact request path.
       */
      const requestPath =
        req.originalUrl.split("?")[0];

      /*
       * Build exact message.
       */
      const message =
        createSignaturePayload({
          timestamp,
          nonce,
          method: req.method,
          path: requestPath,
          bodyHash,
        });

      /*
       * Verify Ed25519 signature.
       */
      const validSignature =
        verifyEd25519Signature({
          publicKey: installation.publicKey,
          message,
          signature,
        });

      if (!validSignature) {
        return res.status(403).json({
          success: false,
          message:
            "Invalid device signature.",
          code: "INVALID_DEVICE_SIGNATURE",
        });
      }

      /*
       * Update activity.
       */
      installation.lastSeenAt =
        new Date();

      await installation.save();

      /*
       * Make data available to controllers.
       */
      req.softwareInstallation =
        installation;

      req.softwareLicense =
        license;

      next();
    } catch (error) {
      console.error(
        "requireSoftwareAuthentication error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to authenticate software installation.",
        code: "SOFTWARE_AUTH_FAILED",
      });
    }
  };