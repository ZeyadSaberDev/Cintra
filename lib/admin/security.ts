import { createHash, timingSafeEqual } from 'node:crypto';

const ADMIN_SESSION_COOKIE = 'bayan_admin_session';
const configuredAdminAccessKey = process.env.ADMIN_ACCESS_KEY?.trim() || '';
if (configuredAdminAccessKey.length < 32) {
  throw new Error('ADMIN_ACCESS_KEY must be configured with at least 32 characters.');
}

let runtimeAdminAccessKey: string | null = null;

export function getAdminSessionCookieName(): string {
  return ADMIN_SESSION_COOKIE;
}

export function verifyAdminAccessKey(candidate: string): boolean {
  const configuredKey = runtimeAdminAccessKey ?? configuredAdminAccessKey;
  const candidateHash = createHash('sha256').update(candidate).digest();
  const configuredHash = createHash('sha256').update(configuredKey).digest();
  return candidateHash.length === configuredHash.length && timingSafeEqual(candidateHash, configuredHash);
}

export function setRuntimeAdminAccessKey(key: string | null): void {
  runtimeAdminAccessKey = key;
}