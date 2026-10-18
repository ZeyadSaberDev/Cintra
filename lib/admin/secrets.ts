import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const adminSessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() || '';
if (adminSessionSecret.length < 32) {
  throw new Error('ADMIN_SESSION_SECRET must be configured with at least 32 characters.');
}

function getEncryptionKey(): Buffer {
  return scryptSync(adminSessionSecret, 'bayan-admin-api-keys', 32);
}

export function encryptAdminSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptAdminSecret(value: string): string {
  const [version, encodedIv, encodedTag, encodedData] = value.split(':');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedData) throw new Error('Invalid encrypted secret.');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(encodedIv, 'base64'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedData, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskAdminSecret(encryptedValue: string): string {
  try {
    const secret = decryptAdminSecret(encryptedValue);
    return secret ? `••••••••${secret.slice(-4)}` : '';
  } catch {
    return '••••••••';
  }
}