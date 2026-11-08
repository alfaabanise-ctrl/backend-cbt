import { createHmac, timingSafeEqual } from "node:crypto";

export class DeviceBindingConfigurationError extends Error {
  constructor() {
    super("Device binding is not configured.");
    this.name = "DeviceBindingConfigurationError";
  }
}

export class InvalidDeviceIdentityError extends Error {
  constructor() {
    super("A hardware identifier or device fingerprint is required.");
    this.name = "InvalidDeviceIdentityError";
  }
}

function getSecret() {
  const secret = process.env.DEVICE_BINDING_SECRET;
  if (!secret || secret.length < 32) {
    throw new DeviceBindingConfigurationError();
  }
  return secret;
}

function normalizeIdentifier(value) {
  const identifier = String(value || "").trim();
  if (identifier.length > 512) {
    throw new InvalidDeviceIdentityError();
  }
  return identifier;
}

function hmacIdentifier(value, secret) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createDeviceHashes({ hardwareId, deviceFingerprint }) {
  const normalizedHardwareId = normalizeIdentifier(hardwareId);
  const normalizedFingerprint = normalizeIdentifier(deviceFingerprint);

  if (!normalizedHardwareId && !normalizedFingerprint) {
    throw new InvalidDeviceIdentityError();
  }

  const secret = getSecret();
  return {
    deviceHash: normalizedHardwareId
      ? hmacIdentifier(normalizedHardwareId, secret)
      : null,
    fingerprintHash: normalizedFingerprint
      ? hmacIdentifier(normalizedFingerprint, secret)
      : null,
  };
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === 32 &&
    rightBuffer.length === 32 &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function matchesDeviceBinding(binding, hashes) {
  if (binding.deviceHash) {
    return constantTimeEqual(binding.deviceHash, hashes.deviceHash);
  }
  if (binding.fingerprintHash) {
    return constantTimeEqual(binding.fingerprintHash, hashes.fingerprintHash);
  }
  return false;
}

export function normalizeDeviceLabel(value) {
  const label = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return label || "Unknown device";
}

export function maskToken(value) {
  const token = String(value || "").trim();
  if (!token) return null;
  return `••••${token.slice(-4)}`;
}
