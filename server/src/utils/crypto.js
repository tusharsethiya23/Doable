// AES-256-GCM encryption for secrets stored in MongoDB (Google OAuth tokens).
// Output format: "<iv>.<authTag>.<ciphertext>" (base64). GCM also detects tampering.
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const key = () => Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');

export function encrypt(plainText) {
  const iv = crypto.randomBytes(12); // must be unique per encryption
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, encrypted] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
