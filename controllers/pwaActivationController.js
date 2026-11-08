import { randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import SoftwareInstallation from "../model/SoftwareInstallation.js";
import SoftwarePwaChallenge from "../model/SoftwarePwaChallenge.js";
import SoftwarePwaDeviceBinding from "../model/SoftwarePwaDeviceBinding.js";
import SoftwareToken from "../model/SoftwareToken.js";
import { verifyEd25519Signature } from "../utils/signature.js";
import {
  consumePwaChallenge,
  PWA_INSTALLATION_LIMIT_PER_DEVICE,
  releasePwaInstallationSlot,
  reservePwaInstallationSlot,
} from "../service/pwaActivation.service.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function config() {
  const rpID = process.env.WEBAUTHN_RP_ID || "examtips.abanise.com";
  const origins = (process.env.WEBAUTHN_ORIGINS ||
    "https://examtips.abanise.com,https://www.examtips.abanise.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return { rpID, origins };
}

function normalizeToken(value) {
  return String(value || "").trim().toUpperCase();
}

function validateIdentity({ systemId, publicKey }) {
  const cleanSystemId = String(systemId || "").trim();
  const cleanPublicKey = String(publicKey || "").trim();
  if (!cleanSystemId || !cleanPublicKey) {
    const error = new Error("PWA installation identity is required.");
    error.status = 400;
    error.code = "INSTALLATION_IDENTITY_REQUIRED";
    throw error;
  }
  return { systemId: cleanSystemId, publicKey: cleanPublicKey };
}

async function loadActivatableLicense(token) {
  const license = await SoftwareToken.findOne({
    token: normalizeToken(token),
  });
  if (!license) {
    const error = new Error("Invalid software activation token.");
    error.status = 404;
    error.code = "INVALID_TOKEN";
    throw error;
  }
  if (license.status === "revoked") {
    const error = new Error("This software license has been revoked.");
    error.status = 403;
    error.code = "ACTIVATION_TOKEN_REVOKED";
    throw error;
  }
  if (license.expiresAt && new Date(license.expiresAt).getTime() <= Date.now()) {
    const error = new Error("This software license has expired.");
    error.status = 403;
    error.code = "LICENSE_EXPIRED";
    throw error;
  }
  if (license.status !== "unused" && license.status !== "active") {
    const error = new Error("This software license cannot be activated.");
    error.status = 403;
    error.code = "LICENSE_NOT_ACTIVE";
    throw error;
  }
  return license;
}

function assertOrigin(req) {
  const origin = req.get("Origin");
  const { origins } = config();
  if (!origin || !origins.includes(origin)) {
    const error = new Error("WebAuthn request origin is not allowed.");
    error.status = 403;
    error.code = "WEBAUTHN_ORIGIN_NOT_ALLOWED";
    throw error;
  }
  return origin;
}

async function createChallengeRecord({
  license,
  challenge,
  operation,
  systemId,
  publicKey,
}) {
  await SoftwarePwaChallenge.create({
    softwareToken: license._id,
    challenge,
    operation,
    systemId,
    publicKey,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
}

function activationResponse(installation, license) {
  return {
    installationId: String(installation._id),
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
  };
}

async function createPwaInstallation({ license, binding, identity, req }) {
  const reserved = await reservePwaInstallationSlot(
    SoftwarePwaDeviceBinding,
    license._id,
  );
  if (!reserved) {
    const error = new Error(
      `This activation token has reached the ${PWA_INSTALLATION_LIMIT_PER_DEVICE} PWA installation limit for its verified authenticator.`,
    );
    error.status = 409;
    error.code = "PWA_INSTALLATION_LIMIT_REACHED";
    throw error;
  }

  let installation;
  let tokenDeviceCountIncremented = false;
  try {
    installation = await SoftwareInstallation.create({
      softwareToken: license._id,
      pwaDeviceBinding: binding._id,
      systemId: identity.systemId,
      publicKey: identity.publicKey,
      platform: "web",
      appVersion: req.body.appVersion || null,
      status: "active",
      activatedAt: new Date(),
      lastSeenAt: new Date(),
      lastVerifiedAt: new Date(),
    });

    const now = new Date();
    const tokenUpdate = await SoftwareToken.updateOne(
      {
        _id: license._id,
        status: { $in: ["unused", "active"] },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      {
        $set: {
          status: "active",
          activatedAt: license.activatedAt || now,
        },
        $inc: { deviceCount: 1 },
      },
    );
    if (tokenUpdate.modifiedCount !== 1) {
      const error = new Error("This software license is no longer active.");
      error.status = 403;
      error.code = "ACTIVATION_TOKEN_REVOKED";
      throw error;
    }
    tokenDeviceCountIncremented = true;
    license.status = "active";
    license.activatedAt ||= now;
    license.deviceCount += 1;
    return installation;
  } catch (error) {
    if (installation) {
      await SoftwareInstallation.deleteOne({ _id: installation._id });
    }
    if (tokenDeviceCountIncremented) {
      await SoftwareToken.updateOne(
        { _id: license._id, deviceCount: { $gt: 0 } },
        { $inc: { deviceCount: -1 } },
      );
    }
    await releasePwaInstallationSlot(
      SoftwarePwaDeviceBinding,
      binding._id,
    );
    throw error;
  }
}

export async function getPwaActivationOptions(req, res) {
  try {
    const origin = assertOrigin(req);
    const license = await loadActivatableLicense(req.body?.token);
    const identity = validateIdentity(req.body || {});

    const existing = await SoftwareInstallation.findOne({
      systemId: identity.systemId,
    });
    if (existing) {
      if (
        String(existing.softwareToken) !== String(license._id) ||
        existing.publicKey !== identity.publicKey
      ) {
        return res.status(409).json({
          success: false,
          code: "INSTALLATION_IDENTITY_MISMATCH",
          message: "This PWA installation is already bound to another license or key.",
        });
      }
      if (existing.status !== "active") {
        return res.status(403).json({
          success: false,
          code: "PWA_INSTALLATION_REVOKED",
          message: "This PWA installation has been revoked.",
        });
      }
      if (existing.pwaDeviceBinding) {
        const existingBinding = await SoftwarePwaDeviceBinding.findById(
          existing.pwaDeviceBinding,
        );
        if (!existingBinding || existingBinding.status !== "active") {
          return res.status(403).json({
            success: false,
            code: "DEVICE_BINDING_MISMATCH",
            message: "This PWA device binding is no longer active.",
          });
        }
        if (license.status !== "active") {
          license.status = "active";
          license.activatedAt ||= new Date();
          await license.save();
        }
        const { rpID } = config();
        const options = await generateAuthenticationOptions({
          rpID,
          allowCredentials: [
            {
              id: existingBinding.credentialId,
              transports: existingBinding.transports,
            },
          ],
          userVerification: "required",
        });
        await createChallengeRecord({
          license,
          challenge: options.challenge,
          operation: "authenticate",
          ...identity,
        });
        return res.json({
          success: true,
          data: { mode: "authenticate", options },
        });
      }
    }

    const existingNativeInstallation = await SoftwareInstallation.exists({
      softwareToken: license._id,
      platform: { $ne: "web" },
      status: "active",
    });
    if (existingNativeInstallation) {
      return res.status(409).json({
        success: false,
        code: "DEVICE_BINDING_MISMATCH",
        message:
          "This activation token is already active in a desktop or mobile app. The PWA cannot verify that it is the same physical device.",
      });
    }

    const { rpID } = config();
    const binding = await SoftwarePwaDeviceBinding.findOne({
      softwareToken: license._id,
      status: "active",
    });

    if (!binding) {
      const activeLegacyInstallations = await SoftwareInstallation.find({
        softwareToken: license._id,
        platform: "web",
        status: "active",
        pwaDeviceBinding: null,
      })
        .select("_id systemId publicKey")
        .lean();
      if (activeLegacyInstallations.length > 1) {
        return res.status(409).json({
          success: false,
          code: "LEGACY_DEVICE_BINDING_AMBIGUOUS",
          message:
            "This previously activated token has multiple PWA identities and cannot be safely migrated automatically. Contact support.",
        });
      }
      const matchingLegacyInstallation = activeLegacyInstallations.find(
        (installation) =>
          installation.systemId === identity.systemId &&
          installation.publicKey === identity.publicKey,
      );
      if (activeLegacyInstallations.length && !matchingLegacyInstallation) {
        return res.status(403).json({
          success: false,
          code: "DEVICE_VERIFICATION_REQUIRED",
          message:
            "This previously activated PWA must still be available to register the device credential. Otherwise, contact support for secure recovery.",
        });
      }
      if (matchingLegacyInstallation) {
        const challenge = randomBytes(32).toString("base64url");
        await createChallengeRecord({
          license,
          challenge,
          operation: "identity",
          ...identity,
        });
        return res.json({
          success: true,
          data: { mode: "identity", challenge },
        });
      }

      const options = await generateRegistrationOptions({
        rpName: "ExamTips",
        rpID,
        userID: Buffer.from(String(license._id)),
        userName: `license-${String(license._id)}`,
        userDisplayName: "ExamTips activation",
        attestationType: "none",
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          userVerification: "required",
        },
      });
      await createChallengeRecord({
        license,
        challenge: options.challenge,
        operation: "register",
        ...identity,
      });
      return res.json({
        success: true,
        data: {
          mode: "register",
          options,
          origin,
          legacyInstallationId: matchingLegacyInstallation
            ? String(matchingLegacyInstallation._id)
            : null,
        },
      });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [
        {
          id: binding.credentialId,
          transports: binding.transports,
        },
      ],
      userVerification: "required",
    });
    await createChallengeRecord({
      license,
      challenge: options.challenge,
      operation: "authenticate",
      ...identity,
    });
    return res.json({
      success: true,
      data: { mode: "authenticate", options, origin },
    });
  } catch (error) {
    console.error("getPwaActivationOptions error:", error);
    return res.status(error.status || 500).json({
      success: false,
      code: error.code || "PWA_ACTIVATION_OPTIONS_FAILED",
      message: error.status ? error.message : "Unable to prepare PWA activation.",
    });
  }
}

export async function completePwaActivation(req, res) {
  try {
    const origin = assertOrigin(req);
    const license = await loadActivatableLicense(req.body?.token);
    const identity = validateIdentity(req.body || {});
    const challenge = String(req.body?.challenge || "");
    if (
      !challenge ||
      (req.body.operation === "identity"
        ? !req.body.signature
        : !req.body.response)
    ) {
      return res.status(400).json({
        success: false,
        code: "DEVICE_VERIFICATION_REQUIRED",
        message: "A WebAuthn device verification response is required.",
      });
    }

    const storedChallenge = await consumePwaChallenge(
      SoftwarePwaChallenge,
      { challengeId: challenge, softwareTokenId: license._id },
    );
    if (!storedChallenge) {
      return res.status(400).json({
        success: false,
        code: "DEVICE_CHALLENGE_EXPIRED_OR_USED",
        message: "The device verification challenge expired or was already used. Please try again.",
      });
    }
    if (
      storedChallenge.operation !== req.body.operation ||
      storedChallenge.systemId !== identity.systemId ||
      storedChallenge.publicKey !== identity.publicKey
    ) {
      return res.status(403).json({
        success: false,
        code: "DEVICE_VERIFICATION_MISMATCH",
        message: "Device verification does not match this PWA installation.",
      });
    }

    const { rpID, origins } = config();
    if (req.body.operation === "identity") {
      const validIdentitySignature = verifyEd25519Signature({
        publicKey: identity.publicKey,
        message: storedChallenge.challenge,
        signature: String(req.body.signature || ""),
      });
      if (!validIdentitySignature) {
        return res.status(403).json({
          success: false,
          code: "INSTALLATION_KEY_INVALID",
          message: "The existing PWA installation key could not be verified.",
        });
      }
      const legacyInstallation = await SoftwareInstallation.findOne({
        softwareToken: license._id,
        systemId: identity.systemId,
        publicKey: identity.publicKey,
        platform: "web",
        status: "active",
        pwaDeviceBinding: null,
      });
      if (!legacyInstallation) {
        return res.status(403).json({
          success: false,
          code: "DEVICE_BINDING_MISMATCH",
          message: "The existing PWA installation is no longer available for migration.",
        });
      }
      const options = await generateRegistrationOptions({
        rpName: "ExamTips",
        rpID,
        userID: Buffer.from(String(license._id)),
        userName: `license-${String(license._id)}`,
        userDisplayName: "ExamTips activation",
        attestationType: "none",
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          userVerification: "required",
        },
      });
      await createChallengeRecord({
        license,
        challenge: options.challenge,
        operation: "register",
        ...identity,
      });
      return res.json({
        success: true,
        data: { mode: "register", options },
      });
    }

    if (req.body.operation === "register") {
      const bindingExists = await SoftwarePwaDeviceBinding.exists({
        softwareToken: license._id,
      });
      if (bindingExists) {
        return res.status(409).json({
          success: false,
          code: "DEVICE_BINDING_ALREADY_EXISTS",
          message: "A device is already bound to this token; verify that device to add an installation.",
        });
      }

      const verification = await verifyRegistrationResponse({
        response: req.body.response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo) {
        return res.status(403).json({
          success: false,
          code: "DEVICE_CREDENTIAL_INVALID",
          message: "The device credential could not be verified.",
        });
      }

      const info = verification.registrationInfo;
      if (
        info.credentialDeviceType !== "singleDevice" ||
        info.credentialBackedUp
      ) {
        return res.status(403).json({
          success: false,
          code: "DEVICE_CREDENTIAL_NOT_SUPPORTED",
          message: "A device-bound, non-synced authenticator is required. Synced passkeys cannot prove a single physical device.",
        });
      }

      const binding = await SoftwarePwaDeviceBinding.create({
        softwareToken: license._id,
        deviceId: info.credential.id,
        credentialId: info.credential.id,
        credentialPublicKey: Buffer.from(info.credential.publicKey),
        counter: info.credential.counter,
        transports: req.body.response.response?.transports || [],
        credentialDeviceType: info.credentialDeviceType,
        credentialBackedUp: info.credentialBackedUp,
        activeInstallationCount: 0,
        lastVerifiedAt: new Date(),
        status: "active",
      });

      const legacyInstallation = await SoftwareInstallation.findOne({
        softwareToken: license._id,
        systemId: identity.systemId,
        publicKey: identity.publicKey,
        platform: "web",
        status: "active",
        pwaDeviceBinding: null,
      });
      if (legacyInstallation) {
        binding.activeInstallationCount = 1;
        await binding.save();
        legacyInstallation.pwaDeviceBinding = binding._id;
        legacyInstallation.lastVerifiedAt = new Date();
        await legacyInstallation.save();
        binding.lastVerifiedAt = new Date();
        await binding.save();
        return res.status(200).json({
          success: true,
          message: "Device credential registered for this existing PWA installation.",
          data: activationResponse(legacyInstallation, license),
        });
      }

      const otherLegacyInstallation = await SoftwareInstallation.exists({
        softwareToken: license._id,
        platform: "web",
        status: "active",
        pwaDeviceBinding: null,
      });
      if (otherLegacyInstallation) {
        await SoftwarePwaDeviceBinding.deleteOne({ _id: binding._id });
        return res.status(403).json({
          success: false,
          code: "DEVICE_BINDING_MISMATCH",
          message: "The legacy PWA identity must be verified before device migration.",
        });
      }

      const installation = await createPwaInstallation({
        license,
        binding,
        identity,
        req,
      });
      return res.status(201).json({
        success: true,
        message: "PWA activated and device credential registered.",
        data: activationResponse(installation, license),
      });
    }

    if (req.body.operation !== "authenticate") {
      return res.status(400).json({
        success: false,
        code: "INVALID_DEVICE_VERIFICATION_OPERATION",
        message: "Unsupported device verification operation.",
      });
    }

    const binding = await SoftwarePwaDeviceBinding.findOne({
      softwareToken: license._id,
      status: "active",
    });
    if (!binding) {
      return res.status(403).json({
        success: false,
        code: "DEVICE_BINDING_MISMATCH",
        message: "This token has no active PWA device binding.",
      });
    }

    const verification = await verifyAuthenticationResponse({
      response: req.body.response,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: binding.credentialId,
        publicKey: new Uint8Array(binding.credentialPublicKey),
        counter: binding.counter,
        transports: binding.transports,
      },
    });
    if (!verification.verified) {
      return res.status(403).json({
        success: false,
        code: "DEVICE_CREDENTIAL_INVALID",
        message: "The registered device credential could not be verified.",
      });
    }

    const update = await SoftwarePwaDeviceBinding.updateOne(
      {
        _id: binding._id,
        status: "active",
        counter: binding.counter,
      },
      {
        $set: {
          counter: verification.authenticationInfo.newCounter,
          credentialBackedUp: verification.authenticationInfo.credentialBackedUp,
          lastVerifiedAt: new Date(),
        },
        $inc: { verificationCount: 1 },
      },
    );
    if (update.modifiedCount !== 1) {
      return res.status(409).json({
        success: false,
        code: "DEVICE_CREDENTIAL_REPLAYED",
        message: "This device credential was used concurrently. Please try again.",
      });
    }

    const existingInstallation = await SoftwareInstallation.findOne({
      systemId: identity.systemId,
    });
    if (existingInstallation) {
      if (
        String(existingInstallation.softwareToken) !== String(license._id) ||
        existingInstallation.publicKey !== identity.publicKey ||
        String(existingInstallation.pwaDeviceBinding) !== String(binding._id) ||
        existingInstallation.status !== "active"
      ) {
        return res.status(409).json({
          success: false,
          code: existingInstallation.status === "revoked"
            ? "PWA_INSTALLATION_REVOKED"
            : "INSTALLATION_IDENTITY_MISMATCH",
          message: "This PWA installation is not active for this device binding.",
        });
      }
      existingInstallation.lastSeenAt = new Date();
      existingInstallation.lastVerifiedAt = new Date();
      await existingInstallation.save();
      return res.json({
        success: true,
        message: "Existing PWA installation verified.",
        data: activationResponse(existingInstallation, license),
      });
    }

    let installation;
    try {
      installation = await createPwaInstallation({
        license,
        binding,
        identity,
        req,
      });
    } catch (error) {
      await SoftwarePwaDeviceBinding.deleteOne({
        _id: binding._id,
        activeInstallationCount: 0,
      });
      throw error;
    }
    return res.status(201).json({
      success: true,
      message: "Additional PWA installation activated.",
      data: activationResponse(installation, license),
    });
  } catch (error) {
    console.error("completePwaActivation error:", error);
    const duplicate = error?.code === 11000;
    return res.status(error.status || (duplicate ? 409 : 500)).json({
      success: false,
      code: error.code === 11000
        ? "PWA_INSTALLATION_ALREADY_REGISTERED"
        : error.code || "PWA_ACTIVATION_FAILED",
      message: error.status
        ? error.message
        : duplicate
          ? "This PWA installation or device credential is already registered."
          : "Unable to complete PWA activation.",
    });
  }
}

export async function listPwaInstallations(req, res) {
  try {
    const installations = await SoftwareInstallation.find({
      softwareToken: req.params.tokenId,
      platform: "web",
    })
      .select("_id systemId status activatedAt lastSeenAt lastVerifiedAt revokedAt")
      .sort({ activatedAt: 1 })
      .lean();

    return res.json({
      success: true,
      data: {
        limitPerDevice: PWA_INSTALLATION_LIMIT_PER_DEVICE,
        installations,
      },
    });
  } catch (error) {
    console.error("listPwaInstallations error:", error);
    return res.status(400).json({
      success: false,
      code: "PWA_INSTALLATION_LIST_FAILED",
      message: "Unable to list PWA installations.",
    });
  }
}

export async function revokePwaInstallation(req, res) {
  try {
    const installation = await SoftwareInstallation.findOneAndUpdate(
      {
        _id: req.params.installationId,
        platform: "web",
        status: "active",
      },
      {
        $set: {
          status: "revoked",
          revokedAt: new Date(),
          revokedBy: req.user?._id || null,
        },
      },
      { new: true },
    );
    if (!installation) {
      return res.status(404).json({
        success: false,
        code: "PWA_INSTALLATION_NOT_FOUND",
        message: "Active PWA installation was not found.",
      });
    }

    if (installation.pwaDeviceBinding) {
      await releasePwaInstallationSlot(
        SoftwarePwaDeviceBinding,
        installation.pwaDeviceBinding,
      );
    }
    await SoftwareToken.updateOne(
      { _id: installation.softwareToken, deviceCount: { $gt: 0 } },
      { $inc: { deviceCount: -1 } },
    );

    return res.json({
      success: true,
      message: "PWA installation revoked.",
      data: { installationId: String(installation._id), status: "revoked" },
    });
  } catch (error) {
    console.error("revokePwaInstallation error:", error);
    return res.status(500).json({
      success: false,
      code: "PWA_INSTALLATION_REVOKE_FAILED",
      message: "Unable to revoke PWA installation.",
    });
  }
}
