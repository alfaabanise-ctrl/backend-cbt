import SoftwareToken from "../model/SoftwareToken.js";
import SoftwareInstallation from "../model/SoftwareInstallation.js";

/**
 * Normalize token.
 */
function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

/**
 * Normalize system ID.
 */
function normalizeSystemId(value) {
  return String(value || "").trim();
}

/**
 * POST /api/software/activate
 *
 * No student account required.
 */
export const activateSoftware = async (req, res) => {
  try {
    const {
      token,
      systemId,
      publicKey,
      platform = "unknown",
      appVersion = null,
    } = req.body || {};

    const normalizedToken = normalizeToken(token);
    const normalizedSystemId = normalizeSystemId(systemId);
    const normalizedPublicKey = String(
      publicKey || ""
    ).trim();

    if (!normalizedToken) {
      return res.status(400).json({
        success: false,
        message: "Software activation token is required.",
        code: "TOKEN_REQUIRED",
      });
    }

    if (!normalizedSystemId) {
      return res.status(400).json({
        success: false,
        message: "System ID is required.",
        code: "SYSTEM_ID_REQUIRED",
      });
    }

    if (!normalizedPublicKey) {
      return res.status(400).json({
        success: false,
        message: "Public key is required.",
        code: "PUBLIC_KEY_REQUIRED",
      });
    }

    /*
     * Find token.
     */
    const license = await SoftwareToken.findOne({
      token: normalizedToken,
    });

    if (!license) {
      return res.status(404).json({
        success: false,
        message: "Invalid software activation token.",
        code: "INVALID_TOKEN",
      });
    }

    /*
     * Revoked.
     */
    if (license.status === "revoked") {
      return res.status(403).json({
        success: false,
        message: "This software license has been revoked.",
        code: "LICENSE_REVOKED",
      });
    }

    /*
     * Expired.
     */
    if (
      license.expiresAt &&
      new Date(license.expiresAt).getTime() <= Date.now()
    ) {
      if (license.status !== "expired") {
        license.status = "expired";
        await license.save();
      }

      return res.status(403).json({
        success: false,
        message: "This software license has expired.",
        code: "LICENSE_EXPIRED",
        expiresAt: license.expiresAt,
      });
    }

    /*
     * Only active/unused licenses can activate.
     *
     * A token can be activated when unused.
     */
    if (
      license.status !== "unused" &&
      license.status !== "active"
    ) {
      return res.status(403).json({
        success: false,
        message: "This software license cannot be activated.",
        code: "LICENSE_NOT_ACTIVE",
      });
    }

    /*
     * Check whether this exact installation
     * was already registered.
     */
    const existingInstallation =
      await SoftwareInstallation.findOne({
        systemId: normalizedSystemId,
      });

    if (existingInstallation) {
      /*
       * If this installation already belongs to
       * another token, reject it.
       */
      if (
        String(existingInstallation.softwareToken) !==
        String(license._id)
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This installation is already registered to another license.",
          code: "INSTALLATION_ALREADY_REGISTERED",
        });
      }

      /*
       * Same installation.
       */
      if (existingInstallation.status === "revoked") {
        return res.status(403).json({
          success: false,
          message:
            "This software installation has been revoked.",
          code: "INSTALLATION_REVOKED",
        });
      }

      existingInstallation.lastSeenAt = new Date();
      existingInstallation.appVersion =
        appVersion || existingInstallation.appVersion;
      existingInstallation.platform =
        platform || existingInstallation.platform;

      await existingInstallation.save();

      return res.status(200).json({
        success: true,
        message: "Software installation is already active.",
        data: {
          installationId: existingInstallation._id,
          systemId: existingInstallation.systemId,
          status: existingInstallation.status,
          expiresAt: license.expiresAt,
          plan: license.plan,
          features: license.features,
        },
      });
    }

    /*
     * Count active installations for this token.
     */
    const activeDeviceCount =
      await SoftwareInstallation.countDocuments({
        softwareToken: license._id,
        status: "active",
      });

    /*
     * Device limit reached.
     */
    if (
      activeDeviceCount >= license.deviceLimit
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This software license has reached its device limit.",
        code: "DEVICE_LIMIT_REACHED",
        deviceLimit: license.deviceLimit,
      });
    }

    /*
     * Register installation.
     */
    const installation =
      await SoftwareInstallation.create({
        softwareToken: license._id,
        systemId: normalizedSystemId,
        publicKey: normalizedPublicKey,
        platform,
        appVersion,
        status: "active",
        activatedAt: new Date(),
        lastSeenAt: new Date(),
      });

    /*
     * Update license.
     */
    license.deviceCount = activeDeviceCount + 1;

    if (license.status === "unused") {
      license.status = "active";
      license.activatedAt = new Date();
    }

    await license.save();

    return res.status(201).json({
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
        },
      },
    });
  } catch (error) {
    console.error(
      "activateSoftware error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to activate software.",
      code: "ACTIVATION_FAILED",
    });
  }
};

export const getInstallationStatus = async (
  req,
  res
) => {
  try {
    const installation = req.softwareInstallation;

    const license = req.softwareLicense;

    return res.status(200).json({
      success: true,
      data: {
        installation: {
          id: installation._id,
          systemId: installation.systemId,
          status: installation.status,
          platform: installation.platform,
          appVersion: installation.appVersion,
          activatedAt: installation.activatedAt,
          lastSeenAt: installation.lastSeenAt,
        },

        license: {
          plan: license.plan,
          status: license.status,
          expiresAt: license.expiresAt,
          features: license.features,
          deviceLimit: license.deviceLimit,
          deviceCount: license.deviceCount,
        },
      },
    });
  } catch (error) {
    console.error(
      "getInstallationStatus error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to check installation.",
    });
  }
};