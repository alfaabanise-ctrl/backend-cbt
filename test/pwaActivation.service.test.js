import assert from "node:assert/strict";
import test from "node:test";

import {
  consumePwaChallenge,
  PWA_INSTALLATION_LIMIT_PER_DEVICE,
  releasePwaInstallationSlot,
  reservePwaInstallationSlot,
} from "../service/pwaActivation.service.js";

test("PWA installation reservations are capped atomically at ten", async () => {
  const binding = {
    softwareToken: "token-1",
    status: "active",
    activeInstallationCount: 0,
  };
  const model = {
    async findOneAndUpdate(filter, update) {
      assert.equal(filter.activeInstallationCount.$lt, 10);
      assert.equal(update.$inc.activeInstallationCount, 1);
      if (
        binding.softwareToken !== filter.softwareToken ||
        binding.status !== filter.status ||
        binding.activeInstallationCount >= filter.activeInstallationCount.$lt
      ) {
        return null;
      }
      binding.activeInstallationCount += update.$inc.activeInstallationCount;
      return { ...binding };
    },
  };

  const reservations = await Promise.all(
    Array.from({ length: 20 }, () =>
      reservePwaInstallationSlot(model, "token-1"),
    ),
  );

  assert.equal(PWA_INSTALLATION_LIMIT_PER_DEVICE, 10);
  assert.equal(reservations.filter(Boolean).length, 10);
  assert.equal(binding.activeInstallationCount, 10);
});

test("releasing an active PWA installation makes its slot available", async () => {
  const binding = {
    _id: "binding-1",
    softwareToken: "token-1",
    status: "active",
    activeInstallationCount: 10,
  };
  const model = {
    async findOneAndUpdate(filter, update) {
      if (
        binding.softwareToken !== filter.softwareToken ||
        binding.status !== filter.status ||
        binding.activeInstallationCount >= filter.activeInstallationCount.$lt
      ) {
        return null;
      }
      binding.activeInstallationCount += update.$inc.activeInstallationCount;
      return { ...binding };
    },
    async updateOne(filter, update) {
      if (
        binding._id !== filter._id ||
        binding.activeInstallationCount <= filter.activeInstallationCount.$gt
      ) {
        return { modifiedCount: 0 };
      }
      binding.activeInstallationCount += update.$inc.activeInstallationCount;
      return { modifiedCount: 1 };
    },
  };

  assert.equal(await reservePwaInstallationSlot(model, "token-1"), null);
  assert.equal((await releasePwaInstallationSlot(model, "binding-1")).modifiedCount, 1);
  assert.ok(await reservePwaInstallationSlot(model, "token-1"));
  assert.equal(binding.activeInstallationCount, 10);
});

test("PWA challenges are atomically claimed only once before expiry", async () => {
  let consumedAt = null;
  const challenge = {
    id: "challenge-1",
    token: "token-1",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  };
  const model = {
    async findOneAndUpdate(filter, update) {
      if (
        filter.challenge !== challenge.id ||
        filter.softwareToken !== challenge.token ||
        consumedAt !== filter.consumedAt ||
        challenge.expiresAt <= filter.expiresAt.$gt
      ) {
        return null;
      }
      consumedAt = update.$set.consumedAt;
      return { ...challenge, consumedAt: null };
    },
  };

  const args = {
    challengeId: challenge.id,
    softwareTokenId: challenge.token,
    now: new Date("2029-01-01T00:00:00.000Z"),
  };

  assert.ok(await consumePwaChallenge(model, args));
  assert.equal(await consumePwaChallenge(model, args), null);
  consumedAt = null;
  assert.equal(
    await consumePwaChallenge(model, {
      ...args,
      now: new Date("2031-01-01T00:00:00.000Z"),
    }),
    null,
  );
});
