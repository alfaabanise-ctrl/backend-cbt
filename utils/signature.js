import crypto from "node:crypto";

/**
 * Build exactly the same message
 * as the Tauri application.
 */
export function createSignaturePayload({
  timestamp,
  nonce,
  method,
  path,
  bodyHash,
}) {
  return [
    String(timestamp),
    String(nonce),
    String(method).toUpperCase(),
    String(path),
    String(bodyHash),
  ].join("\n");
}

/**
 * SHA-256 body hash.
 */
export function hashBody(body = "") {
  return crypto
    .createHash("sha256")
    .update(body)
    .digest("hex");
}

/**
 * Verify Ed25519 signature.
 */
export function verifyEd25519Signature({
  publicKey,
  message,
  signature,
}) {
  try {
    const keyObject =
      crypto.createPublicKey({
        key: publicKey,
        format: "pem",
        type: "spki",
      });

    return crypto.verify(
      null,
      Buffer.from(message),
      keyObject,
      Buffer.from(
        signature,
        "base64",
      ),
    );
  } catch (error) {
    console.error(
      "Ed25519 verification failed:",
      error,
    );

    return false;
  }
}