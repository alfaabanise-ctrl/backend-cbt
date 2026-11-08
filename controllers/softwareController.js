import mongoose from "mongoose";
import SoftwareToken from "../model/SoftwareToken.js";
import SoftwareInstallation from "../model/SoftwareInstallation.js";
import SoftwareDeviceEvent from "../model/SoftwareDeviceEvent.js";
import Usercbt from "../model/Users.js";
import {
  createDeviceHashes,
  DeviceBindingConfigurationError,
  InvalidDeviceIdentityError,
  maskToken,
  matchesDeviceBinding,
  normalizeDeviceLabel,
} from "../utils/deviceBinding.js";

const MAX_BINDING_FAILURES = 5;
const LOCKOUT_MS = 30 * 60 * 1000;

function normalizeToken(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeSystemId(value) {
  return String(value || "").trim();
}

function isBindingLocked(license) {
  return (
    license.deviceBindingLockedUntil &&
    new Date(license.deviceBindingLockedUntil).getTime() > Date.now()
  );
}

async function recordBindingFailure(license, hashes, session = null) {
  const attempts = Number(license.deviceBindingFailedAttempts || 0) + 1;
  license.deviceBindingFailedAttempts = attempts;
  if (attempts >= MAX_BINDING_FAILURES) {
    license.deviceBindingLockedUntil = new Date(Date.now() + LOCKOUT_MS);
  }
  await license.save(session ? { session } : undefined);

  const event = {
    softwareToken: license._id,
    action: attempts >= MAX_BINDING_FAILURES ? "lockout" : "mismatch",
    deviceHash: hashes.deviceHash || hashes.fingerprintHash,
    reason: "Device identity did not match an available license binding.",
  };
  await SoftwareDeviceEvent.create([event], session ? { session } : undefined);
}

function resetFailedAttempts(license) {
  license.deviceBindingFailedAttempts = 0;
  license.deviceBindingLockedUntil = null;
}

async function revokePreviousBindingInstallation(binding, currentId, session = null) {
  if (
    !binding?.installation ||
    String(binding.installation) === String(currentId)
  ) {
    return;
  }

  let query = SoftwareInstallation.findOne({
    _id: binding.installation,
    status: "active",
  });
  if (session) query = query.session(session);

  const previousInstallation = await query;
  if (previousInstallation) {
    previousInstallation.status = "revoked";
    await previousInstallation.save(session ? { session } : undefined);
  }
}

function identityErrorResponse(error, res) {
  if (error instanceof DeviceBindingConfigurationError) {
    return res.status(503).json({
      success: false,
      message: "Device binding is temporarily unavailable.",
      code: "DEVICE_BINDING_NOT_CONFIGURED",
    });
  }
  if (error instanceof InvalidDeviceIdentityError) {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: "DEVICE_IDENTITY_REQUIRED",
    });
  }
  return null;
}

/**
 * POST /api/software/activate
 */
export const activateSoftware = async (req, res) => {
  let session;
  try {
    const {
      token,
      systemId,
      publicKey,
      hardwareId,
      deviceFingerprint,
      deviceLabel,
      platform = "unknown",
      appVersion = null,
    } = req.body || {};
    const normalizedToken = normalizeToken(token);
    const normalizedSystemId = normalizeSystemId(systemId);
    const normalizedPublicKey = String(publicKey || "").trim();

    if (!normalizedToken || !normalizedSystemId || !normalizedPublicKey) {
      return res.status(400).json({
        success: false,
        message: "Activation token, installation ID and public key are required.",
        code: !normalizedToken
          ? "TOKEN_REQUIRED"
          : !normalizedSystemId
            ? "SYSTEM_ID_REQUIRED"
            : "PUBLIC_KEY_REQUIRED",
      });
    }

    let hashes;
    try {
      hashes = createDeviceHashes({ hardwareId, deviceFingerprint });
    } catch (error) {
      const response = identityErrorResponse(error, res);
      if (response) return response;
      throw error;
    }

    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      const license = await SoftwareToken.findOne({
        token: normalizedToken,
      }).session(session);

      if (!license) {
        result = { status: 404, body: { success: false, message: "Invalid software activation token.", code: "INVALID_TOKEN" } };
        return;
      }

      if (isBindingLocked(license)) {
        result = { status: 423, body: { success: false, message: "Device activation is temporarily locked. Contact support or try again later.", code: "DEVICE_BINDING_LOCKED", lockedUntil: license.deviceBindingLockedUntil } };
        return;
      }
      if (license.status === "revoked") {
        result = { status: 403, body: { success: false, message: "This software license has been revoked.", code: "LICENSE_REVOKED" } };
        return;
      }
      if (license.expiresAt && new Date(license.expiresAt).getTime() <= Date.now()) {
        result = { status: 403, body: { success: false, message: "This software license has expired.", code: "LICENSE_EXPIRED", expiresAt: license.expiresAt } };
        return;
      }
      if (!["unused", "active"].includes(license.status)) {
        result = { status: 403, body: { success: false, message: "This software license cannot be activated.", code: "LICENSE_NOT_ACTIVE" } };
        return;
      }

      const sameInstallation = await SoftwareInstallation.findOne({
        systemId: normalizedSystemId,
      }).session(session);
      const bindings = license.deviceBindings || [];
      if (sameInstallation && String(sameInstallation.softwareToken) !== String(license._id)) {
        result = { status: 409, body: { success: false, message: "This installation is already registered to another license.", code: "INSTALLATION_ALREADY_REGISTERED" } };
        return;
      }
      if (
        sameInstallation?.status === "revoked" &&
        bindings.length > 0
      ) {
        result = { status: 403, body: { success: false, message: "This software installation has been revoked.", code: "INSTALLATION_REVOKED" } };
        return;
      }
      let binding = bindings.find((item) => matchesDeviceBinding(item, hashes));
      if (sameInstallation) {
        binding = bindings.find(
          (item) => String(item.installation || "") === String(sameInstallation._id),
        ) || binding;
        if (binding && !matchesDeviceBinding(binding, hashes)) {
          await recordBindingFailure(license, hashes, session);
          result = { status: 403, body: { success: false, message: "This license is bound to another device.", code: "DEVICE_MISMATCH" } };
          return;
        }
      }

      if (!binding) {
        const activeCount = await SoftwareInstallation.countDocuments({
          softwareToken: license._id,
          status: "active",
        }).session(session);
        if (
          activeCount >= license.deviceLimit &&
          !(
            sameInstallation?.status === "active" &&
            bindings.length === 0
          )
        ) {
          await recordBindingFailure(license, hashes, session);
          result = {
            status: isBindingLocked(license) ? 423 : 409,
            body: {
              success: false,
              message: isBindingLocked(license)
                ? "Device activation is temporarily locked. Contact support or try again later."
                : "This software license has reached its device limit.",
              code: isBindingLocked(license) ? "DEVICE_BINDING_LOCKED" : "DEVICE_LIMIT_REACHED",
              deviceLimit: license.deviceLimit,
              ...(isBindingLocked(license) ? { lockedUntil: license.deviceBindingLockedUntil } : {}),
            },
          };
          return;
        }
        binding = license.deviceBindings.create({
          ...hashes,
          deviceLabel: normalizeDeviceLabel(deviceLabel),
          boundAt: new Date(),
          lastSeenAt: new Date(),
        });
        license.deviceBindings.push(binding);
      }

      let installation = sameInstallation;
      if (!installation && binding.installation) {
        installation = await SoftwareInstallation.findById(binding.installation).session(session);
      }

      if (installation?.status !== "active") {
        const activeCount = await SoftwareInstallation.countDocuments({
          softwareToken: license._id,
          status: "active",
        }).session(session);
        if (activeCount >= license.deviceLimit) {
          await recordBindingFailure(license, hashes, session);
          result = {
            status: isBindingLocked(license) ? 423 : 409,
            body: {
              success: false,
              message: isBindingLocked(license)
                ? "Device activation is temporarily locked. Contact support or try again later."
                : "This software license has reached its device limit.",
              code: isBindingLocked(license)
                ? "DEVICE_BINDING_LOCKED"
                : "DEVICE_LIMIT_REACHED",
              deviceLimit: license.deviceLimit,
              ...(isBindingLocked(license)
                ? { lockedUntil: license.deviceBindingLockedUntil }
                : {}),
            },
          };
          return;
        }
      }

      if (installation) {
        await revokePreviousBindingInstallation(
          binding,
          installation._id,
          session,
        );
        installation.systemId = normalizedSystemId;
        installation.publicKey = normalizedPublicKey;
        installation.platform = platform;
        installation.appVersion = appVersion;
        installation.deviceLabel = normalizeDeviceLabel(deviceLabel);
        installation.status = "active";
        installation.lastSeenAt = new Date();
        await installation.save({ session });
      } else {
        [installation] = await SoftwareInstallation.create(
          [{
            softwareToken: license._id,
            systemId: normalizedSystemId,
            publicKey: normalizedPublicKey,
            platform,
            appVersion,
            deviceLabel: normalizeDeviceLabel(deviceLabel),
            status: "active",
            activatedAt: new Date(),
            lastSeenAt: new Date(),
          }],
          { session },
        );
      }

      binding.installation = installation._id;
      binding.deviceLabel = normalizeDeviceLabel(deviceLabel);
      binding.lastSeenAt = new Date();
      resetFailedAttempts(license);
      license.deviceCount = await SoftwareInstallation.countDocuments({
        softwareToken: license._id,
        status: "active",
      }).session(session);
      if (license.status === "unused") {
        license.status = "active";
        license.activatedAt = new Date();
      }
      await license.save({ session });

      await SoftwareDeviceEvent.create(
        [{
          softwareToken: license._id,
          installation: installation._id,
          action: "bound",
          deviceHash: hashes.deviceHash || hashes.fingerprintHash,
          reason: "Device activation completed.",
        }],
        { session },
      );

      result = {
        status: sameInstallation ? 200 : 201,
        body: {
          success: true,
          message: "Software activated successfully.",
          data: {
            installationId: installation._id,
            systemId: installation.systemId,
            status: installation.status,
            license: {
              plan: license.plan,
              status: license.status,
              expiresAt: license.expiresAt,
              deviceLimit: license.deviceLimit,
              deviceCount: license.deviceCount,
              features: license.features,
              deviceBound: true,
            },
          },
        },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    const response = identityErrorResponse(error, res);
    if (response) return response;
    console.error("activateSoftware failed:", error?.name, error?.code);
    return res.status(503).json({
      success: false,
      message: "Unable to activate software. Please try again.",
      code: error?.code === 20 || /replica set|transaction numbers/i.test(error?.message || "")
        ? "TRANSACTIONS_REQUIRED"
        : "ACTIVATION_FAILED",
    });
  } finally {
    if (session) await session.endSession();
  }
};

/**
 * POST /api/software/bind-device
 */
export const bindSoftwareDevice = async (req, res) => {
  try {
    const installation = req.softwareInstallation;
    const license = req.softwareLicense;
    let hashes;
    try {
      hashes = createDeviceHashes(req.body || {});
    } catch (error) {
      const response = identityErrorResponse(error, res);
      if (response) return response;
      throw error;
    }

    if (isBindingLocked(license)) {
      return res.status(423).json({
        success: false,
        message: "Device binding is temporarily locked.",
        code: "DEVICE_BINDING_LOCKED",
        lockedUntil: license.deviceBindingLockedUntil,
      });
    }

    const bindings = license.deviceBindings || [];
    let binding = bindings.find(
      (item) => String(item.installation || "") === String(installation._id),
    );
    if (binding && !matchesDeviceBinding(binding, hashes)) {
      await recordBindingFailure(license, hashes);
      return res.status(403).json({
        success: false,
        message: "This installation is bound to another device.",
        code: "DEVICE_MISMATCH",
      });
    }

    if (!binding) {
      binding = bindings.find((item) => matchesDeviceBinding(item, hashes));
      if (!binding && bindings.length >= license.deviceLimit) {
        await recordBindingFailure(license, hashes);
        return res.status(isBindingLocked(license) ? 423 : 409).json({
          success: false,
          message: isBindingLocked(license)
            ? "Device binding is temporarily locked."
            : "This software license has reached its device limit.",
          code: isBindingLocked(license) ? "DEVICE_BINDING_LOCKED" : "DEVICE_LIMIT_REACHED",
          ...(isBindingLocked(license) ? { lockedUntil: license.deviceBindingLockedUntil } : {}),
        });
      }
      if (!binding) {
        binding = license.deviceBindings.create({
          ...hashes,
          deviceLabel: normalizeDeviceLabel(req.body?.deviceLabel),
          installation: installation._id,
        });
        license.deviceBindings.push(binding);
      } else {
        binding.installation = installation._id;
      }
    }

    await revokePreviousBindingInstallation(binding, installation._id);
    binding.deviceLabel = normalizeDeviceLabel(req.body?.deviceLabel || installation.deviceLabel);
    binding.lastSeenAt = new Date();
    installation.deviceLabel = binding.deviceLabel;
    installation.lastSeenAt = new Date();
    resetFailedAttempts(license);
    await Promise.all([license.save(), installation.save()]);
    await SoftwareDeviceEvent.create({
      softwareToken: license._id,
      installation: installation._id,
      action: "bound",
      deviceHash: hashes.deviceHash || hashes.fingerprintHash,
      reason: "Installation binding confirmed.",
    });

    return res.status(200).json({
      success: true,
      data: {
        license: {
          plan: license.plan,
          status: license.status,
          expiresAt: license.expiresAt,
          features: license.features,
          deviceLimit: license.deviceLimit,
          deviceCount: license.deviceCount,
          deviceBound: true,
        },
      },
    });
  } catch (error) {
    const response = identityErrorResponse(error, res);
    if (response) return response;
    console.error("bindSoftwareDevice failed:", error?.name, error?.code);
    return res.status(500).json({
      success: false,
      message: "Unable to confirm this device binding.",
      code: "DEVICE_BINDING_FAILED",
    });
  }
};

export const resetSoftwareDevice = async (req, res) => {
  try {
    const tokenId = String(req.params.tokenId || "");
    if (!mongoose.Types.ObjectId.isValid(tokenId)) {
      return res.status(400).json({ success: false, message: "Invalid software token ID." });
    }

    const license = await SoftwareToken.findById(tokenId);
    if (!license) {
      return res.status(404).json({ success: false, message: "Software license not found." });
    }

    const actorRole = req.user?.role;
    const studentFilter = {
      role: "student",
      softwareToken: license._id,
    };
    if (actorRole === "admin") {
      studentFilter.adminOwner = req.user._id;
    } else if (actorRole === "teacher") {
      studentFilter.teacherOwner = req.user._id;
    }

    const student = await Usercbt.findOne(studentFilter)
      .select("_id adminOwner teacherOwner");
    const allowed =
      actorRole === "superadmin" ||
      actorRole === "admin" ||
      actorRole === "teacher";
    if (!student || !allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to reset this license's device binding.",
      });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await SoftwareInstallation.updateMany(
          { softwareToken: license._id, status: "active" },
          { $set: { status: "revoked" } },
          { session },
        );
        license.deviceBindings = [];
        license.deviceCount = 0;
        license.deviceBindingFailedAttempts = 0;
        license.deviceBindingLockedUntil = null;
        await license.save({ session });
        await SoftwareDeviceEvent.create(
          [{
            softwareToken: license._id,
            actor: req.user._id,
            actorRole,
            action: "reset",
            reason: "Authorized administrator reset the device binding.",
          }],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return res.status(200).json({
      success: true,
      message: "Device binding reset. The student can activate the license again.",
      data: { tokenId: license._id, deviceCount: 0 },
    });
  } catch (error) {
    console.error("resetSoftwareDevice error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to reset the software device binding.",
    });
  }
};

export const getInstallationStatus = async (req, res) => {
  try {
    const installation = req.softwareInstallation;
    const license = req.softwareLicense;

    return res.status(200).json({
      success: true,
      data: {
        installation: {
          id: installation._id,
          status: installation.status,
          platform: installation.platform,
          appVersion: installation.appVersion,
          deviceLabel: installation.deviceLabel,
          activatedAt: installation.activatedAt,
          lastSeenAt: installation.lastSeenAt,
        },
        license: {
          plan: license.plan,
          maskedToken: maskToken(license.token),
          status: license.status,
          expiresAt: license.expiresAt,
          features: license.features,
          deviceLimit: license.deviceLimit,
          deviceCount: license.deviceCount,
          deviceBound: Boolean(license.deviceBindings?.length),
          deviceBindingLockedUntil: license.deviceBindingLockedUntil,
        },
      },
    });
  } catch (error) {
    console.error("getInstallationStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to check installation.",
    });
  }
};
