import crypto from "crypto";
import SoftwareToken from "../model/SoftwareToken.js";

const CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomBlock = (length = 4) => {
  let result = "";

  for (let i = 0; i < length; i++) {
    const index = crypto.randomInt(
      0,
      CHARACTERS.length
    );

    result += CHARACTERS[index];
  }

  return result;
};

export const generateSoftwareToken = () => {
  return [
    randomBlock(),
    randomBlock(),
    randomBlock(),
    randomBlock()
  ].join("-");
};

export const generateSoftwareTokenforuser = async ({
  user,
  features = [],
  expiresAt = null,
  deviceLimit = 1
} = {}) => {

  if (!user?._id) {
    throw new Error("Owner account is required.");
  }

  let token;

  // Generate a unique token
  while (true) {
    token = generateSoftwareToken();

    const existingToken =
      await SoftwareToken.exists({
        token
      });

    if (!existingToken) {
      break;
    }
  }

  // Create token
  const softwareToken =
    await SoftwareToken.create({
      token,

      // Account that owns the token
      owner: user._id,

      status: "unused",

      // Nobody has activated it yet
      activatedBy: null,

      activatedAt: null,

      expiresAt,

      features,

      deviceLimit,

      deviceCount: 0
    });

  return softwareToken;
};