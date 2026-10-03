import crypto from "node:crypto";

export function generateSoftwareToken() {
  const part1 = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();

  const part2 = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();

  const part3 = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();

  return `ABANISE-${part1}-${part2}-${part3}`;
}