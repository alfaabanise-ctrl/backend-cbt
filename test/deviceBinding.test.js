import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeviceHashes,
  InvalidDeviceIdentityError,
  matchesDeviceBinding,
  normalizeDeviceLabel,
} from "../utils/deviceBinding.js";

test("device hashes are stable and never contain the source identifier", () => {
  process.env.DEVICE_BINDING_SECRET = "test-secret-with-more-than-32-characters";
  const first = createDeviceHashes({ hardwareId: "hashed-native-device-id" });
  const second = createDeviceHashes({ hardwareId: "hashed-native-device-id" });

  assert.deepEqual(first, second);
  assert.notEqual(first.deviceHash, "hashed-native-device-id");
  assert.equal(first.fingerprintHash, null);
});

test("device matching uses hardware ID or browser fingerprint without mixing them", () => {
  process.env.DEVICE_BINDING_SECRET = "test-secret-with-more-than-32-characters";
  const browser = createDeviceHashes({ deviceFingerprint: "browser-fingerprint" });
  const native = createDeviceHashes({ hardwareId: "native-id" });

  assert.equal(matchesDeviceBinding(browser, browser), true);
  assert.equal(matchesDeviceBinding(browser, native), false);
  assert.equal(matchesDeviceBinding(native, native), true);
});

test("device identity is required and labels are bounded and sanitized", () => {
  process.env.DEVICE_BINDING_SECRET = "test-secret-with-more-than-32-characters";
  assert.throws(() => createDeviceHashes({}), InvalidDeviceIdentityError);
  assert.equal(normalizeDeviceLabel("  My\u0000 Device \nName  "), "My Device Name");
  assert.equal(normalizeDeviceLabel("x".repeat(100)).length, 80);
});
