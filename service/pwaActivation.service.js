export const PWA_INSTALLATION_LIMIT_PER_DEVICE = 10;

export function reservePwaInstallationSlot(bindingModel, softwareTokenId) {
  return bindingModel.findOneAndUpdate(
    {
      softwareToken: softwareTokenId,
      status: "active",
      activeInstallationCount: {
        $lt: PWA_INSTALLATION_LIMIT_PER_DEVICE,
      },
    },
    {
      $inc: { activeInstallationCount: 1 },
      $set: { lastVerifiedAt: new Date() },
    },
    { new: true },
  );
}

export function releasePwaInstallationSlot(bindingModel, bindingId) {
  return bindingModel.updateOne(
    { _id: bindingId, activeInstallationCount: { $gt: 0 } },
    { $inc: { activeInstallationCount: -1 } },
  );
}

export function consumePwaChallenge(
  challengeModel,
  { challengeId, softwareTokenId, now = new Date() },
) {
  return challengeModel.findOneAndUpdate(
    {
      challenge: challengeId,
      softwareToken: softwareTokenId,
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { new: false },
  );
}
