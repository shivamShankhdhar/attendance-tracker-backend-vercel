import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

const BCRYPT_SALT_ROUNDS = 10;
const ALGORITHM = 'aes-256-gcm';

/**
 * Generate a cryptographically secure random token (hex string)
 */
export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token using SHA-256 for fast indexed lookups in MongoDB
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Hash a numeric PIN with bcrypt
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_SALT_ROUNDS);
}

/**
 * Verify a plaintext PIN against a stored bcrypt hash
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/**
 * Encrypt a string using AES-256-GCM with server QR_ENCRYPTION_KEY
 */
export function encryptToken(plainText: string): string {
  const key = Buffer.from(env.QR_ENCRYPTION_KEY.slice(0, 64), 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: iv:encrypted:authTag (all hex)
  return `${iv.toString('hex')}:${encrypted}:${tag.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string
 */
export function decryptToken(cipherTextWithMeta: string): string {
  const parts = cipherTextWithMeta.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, encryptedHex, tagHex] = parts;
  const key = Buffer.from(env.QR_ENCRYPTION_KEY.slice(0, 64), 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
