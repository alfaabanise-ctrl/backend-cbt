
import crypto from 'crypto';
import logger from './logger.js';

/**
 * Encryption utilities for sensitive data
 */

// Get encryption key from environment
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
// Use a consistent IV for deterministic encryption
const IV_LENGTH = 16;
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt a string
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted text (hex)
 */
export const encrypt = (text) => {
  try {
    if (!text) return null;
    if (!ENCRYPTION_KEY) {
      logger.error('ENCRYPTION_KEY is not set');
      throw new Error('Encryption key not set');
    }

    // Create a unique IV for each encryption
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    logger.error(`Encryption error: ${err.message}`);
    throw new Error('Encryption failed');
  }
};

/**
 * Decrypt an encrypted string
 * @param {string} encryptedText - Encrypted text (hex)
 * @returns {string} - Decrypted text
 */
export const decrypt = (encryptedText) => {
  try {
    if (!encryptedText) return null;
    if (!ENCRYPTION_KEY) {
      logger.error('ENCRYPTION_KEY is not set');
      throw new Error('Encryption key not set');
    }

    // Split IV and encrypted data
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted text format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    logger.error(`Decryption error: ${err.message}`);
    throw new Error('Decryption failed');
  }
};

/**
 * Deterministically encrypt a string (same input always generates same output)
 * Useful for searchable encrypted fields like SSN, medical IDs
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted text (hex)
 */
export const encryptDeterministic = (text) => {
  try {
    if (!text) return null;
    if (!ENCRYPTION_KEY) {
      logger.error('ENCRYPTION_KEY is not set');
      throw new Error('Encryption key not set');
    }

    // Use a fixed IV derived from the input
    const hmac = crypto.createHmac('sha256', ENCRYPTION_KEY);
    hmac.update(text);
    const derivedIv = hmac.digest().slice(0, IV_LENGTH);

    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, derivedIv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return encrypted;
  } catch (err) {
    logger.error(`Deterministic encryption error: ${err.message}`);
    throw new Error('Encryption failed');
  }
};

/**
 * Hash sensitive data like passwords with a secure algorithm
 * @param {string} text - Text to hash
 * @returns {string} - Hashed string
 */
export const secureHash = (text) => {
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex');
};
