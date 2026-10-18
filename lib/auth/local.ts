import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { compareSync, hashSync } from 'bcryptjs';
import { getDatabase } from '../db/sqlite.js';
import { LocalDatabaseError, runLocalTransaction } from '../db/repository.js';
import { userRepo, type DbUser } from '../db/index.js';
import { sendPasswordResetLink } from './emailOtp.js';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthenticatedLocalUser {
  $id: string;
  email: string;
  emailVerification: boolean;
  status: boolean;
  name: string;
}

type AccountRow = {
  user_id: string;
  email: string;
  password_hash: string | null;
  email_verified: number;
  is_enabled: number;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const digestToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function localAuthErrorCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code: unknown }).code;
  return typeof code === 'number' ? code : null;
}

export function isLocalCredentialError(error: unknown): boolean {
  return [400, 401, 404, 409].includes(localAuthErrorCode(error) || 0);
}

function passwordHash(password: string): string {
  if (Buffer.byteLength(password, 'utf8') > 72) throw new RangeError('Password is too long.');
  return hashSync(password, 12);
}

function verifyPassword(password: string, encoded: string | null): boolean {
  if (!encoded) return false;
  if (encoded.startsWith('$2')) {
    if (Buffer.byteLength(password, 'utf8') > 72) return false;
    try {
      return compareSync(password, encoded);
    } catch {
      return false;
    }
  }
  const [algorithm, salt, expectedHex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function accountForUser(userId: string): AccountRow | undefined {
  return getDatabase().prepare('SELECT * FROM auth_accounts WHERE user_id = ?').get(userId) as AccountRow | undefined;
}

function publicAuthUser(account: AccountRow, user: DbUser): AuthenticatedLocalUser {
  return {
    $id: account.user_id,
    email: account.email,
    emailVerification: Boolean(account.email_verified),
    status: Boolean(account.is_enabled),
    name: user.name || account.email,
  };
}

async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  getDatabase().prepare(`
    INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(digestToken(token), userId, expiresAt, now.toISOString());
  return token;
}

export async function createEmailPasswordAccount(input: {
  email: string;
  password: string;
  name?: string | null;
  languagePreference?: 'auto' | 'ar' | 'en';
  verificationUrl?: string;
}): Promise<{ user: DbUser; sessionSecret: string; verificationEmailSent: boolean }> {
  const email = normalizeEmail(input.email);
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    getDatabase().prepare(`
      INSERT INTO auth_accounts (user_id, email, password_hash, email_verified, is_enabled, created_at, updated_at)
      VALUES (?, ?, ?, 1, 1, ?, ?)
    `).run(id, email, passwordHash(input.password), now, now);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new LocalDatabaseError('An account with this email already exists.', 409);
    }
    throw error;
  }
  try {
    const user = await userRepo.create({
      id,
      authUserId: id,
      email,
      name: input.name || email.split('@')[0],
      languagePreference: input.languagePreference,
      emailVerified: now,
    });
    return { user, sessionSecret: await createSession(id), verificationEmailSent: false };
  } catch (error) {
    getDatabase().prepare('DELETE FROM auth_accounts WHERE user_id = ?').run(id);
    throw error;
  }
}

export async function signInWithEmailPassword(emailInput: string, password: string): Promise<{
  authUser: AuthenticatedLocalUser;
  user: DbUser;
  sessionSecret: string;
}> {
  const account = getDatabase().prepare('SELECT * FROM auth_accounts WHERE email = ? COLLATE NOCASE')
    .get(normalizeEmail(emailInput)) as AccountRow | undefined;
  if (!account || !verifyPassword(password, account.password_hash)) {
    throw new LocalDatabaseError('Invalid email or password.', 401);
  }
  if (!account.is_enabled) throw Object.assign(new Error('Account is disabled.'), { code: 'ACCOUNT_DISABLED' });
  const user = await userRepo.findById(account.user_id);
  if (!user) throw new Error('The local account profile could not be found.');
  if (Boolean(user.isBanned)) throw Object.assign(new Error('Account is disabled.'), { code: 'ACCOUNT_DISABLED' });
  return {
    authUser: publicAuthUser(account, user),
    user,
    sessionSecret: await createSession(account.user_id),
  };
}

export async function authenticateSession(sessionToken: string): Promise<{
  authUser: AuthenticatedLocalUser;
  user: DbUser;
}> {
  const row = getDatabase().prepare(`
    SELECT a.*, s.expires_at
    FROM auth_sessions s JOIN auth_accounts a ON a.user_id = s.user_id
    WHERE s.token_hash = ?
  `).get(digestToken(sessionToken)) as (AccountRow & { expires_at: string }) | undefined;
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    if (row) getDatabase().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(digestToken(sessionToken));
    throw new LocalDatabaseError('Session is expired or invalid.', 401);
  }
  if (!row.is_enabled) throw Object.assign(new Error('Account is disabled.'), { code: 'ACCOUNT_DISABLED' });
  const user = await userRepo.findById(row.user_id);
  if (!user) throw new Error('The local account profile could not be found.');
  if (Boolean(user.isBanned)) throw Object.assign(new Error('Account is disabled.'), { code: 'ACCOUNT_DISABLED' });
  return { authUser: publicAuthUser(row, user), user };
}

export async function createGuestSession(deviceId: string, languagePreference: 'auto' | 'ar' | 'en' = 'auto'): Promise<{
  user: DbUser;
  sessionSecret: string;
}> {
  const deviceKey = `guest_${createHash('sha256').update(deviceId).digest('hex').slice(0, 30)}`;
  const device = await new (await import('../db/repository.js')).LocalRepository<{ id: string; userId: string }>('GuestDevice').get(deviceKey);
  if (device) {
    const existing = await userRepo.findById(device.userId);
    if (existing && !Boolean(existing.isBanned)) return { user: existing, sessionSecret: await createUserSession(existing.id) };
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const email = `${id}@guest.local`;
  getDatabase().prepare(`
    INSERT INTO auth_accounts (user_id, email, password_hash, email_verified, is_enabled, created_at, updated_at)
    VALUES (?, ?, NULL, 1, 1, ?, ?)
  `).run(id, email, now, now);
  try {
    const user = await userRepo.create({
      id, authUserId: id, name: `Guest ${id.slice(0, 6)}`, isGuest: true, languagePreference,
    });
    const { LocalRepository } = await import('../db/repository.js');
    await new LocalRepository<{ id: string; userId: string }>('GuestDevice').create(deviceKey, { userId: id });
    return { user, sessionSecret: await createSession(id) };
  } catch (error) {
    getDatabase().prepare('DELETE FROM auth_accounts WHERE user_id = ?').run(id);
    throw error;
  }
}

export async function sendVerificationEmail(_sessionToken?: string, _url?: string): Promise<void> {
  return;
}

export async function confirmEmailVerification(userId: string, _token?: string): Promise<void> {
  getDatabase().prepare('UPDATE auth_accounts SET email_verified = 1 WHERE user_id = ?').run(userId);
  await userRepo.update(userId, { emailVerified: new Date().toISOString() });
}

export async function requestPasswordReset(emailInput: string, url: string): Promise<void> {
  const email = normalizeEmail(emailInput);
  const account = getDatabase().prepare('SELECT user_id FROM auth_accounts WHERE email = ? COLLATE NOCASE').get(email) as { user_id: string } | undefined;
  if (!account) throw new LocalDatabaseError('Account was not found.', 404);
  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  getDatabase().prepare('DELETE FROM password_resets WHERE user_id = ?').run(account.user_id);
  getDatabase().prepare(`
    INSERT INTO password_resets (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(digestToken(token), account.user_id, expiresAt, now);
  await sendPasswordResetLink(email, `${url}${url.includes('?') ? '&' : '?'}userId=${encodeURIComponent(account.user_id)}&secret=${encodeURIComponent(token)}`);
}

export async function completePasswordReset(userId: string, token: string, password: string): Promise<void> {
  if (Buffer.byteLength(password, 'utf8') > 72) throw new LocalDatabaseError('Password is too long.', 400);
  const database = getDatabase();
  const reset = database.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND user_id = ?')
    .get(digestToken(token), userId) as { token_hash: string; expires_at: string } | undefined;
  if (!reset || Date.parse(reset.expires_at) <= Date.now()) {
    if (reset) database.prepare('DELETE FROM password_resets WHERE token_hash = ?').run(reset.token_hash);
    throw new LocalDatabaseError('Password reset token is invalid or expired.', 400);
  }
  database.prepare('UPDATE auth_accounts SET password_hash = ?, updated_at = ? WHERE user_id = ?')
    .run(passwordHash(password), new Date().toISOString(), userId);
  database.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
}

export async function updateLocalAccountCredentials(
  userId: string,
  updates: { email?: string; password?: string; currentSessionToken?: string },
): Promise<{ email: string }> {
  const database = getDatabase();
  const account = accountForUser(userId);
  if (!account) throw new LocalDatabaseError('Local account was not found.', 404);
  const email = updates.email === undefined ? account.email : normalizeEmail(updates.email);
  const emailChanged = email !== account.email.trim().toLowerCase();
  if (updates.password !== undefined && Buffer.byteLength(updates.password, 'utf8') > 72) {
    throw new LocalDatabaseError('Password is too long.', 400);
  }
  const profile = await userRepo.findByAuthId(userId);
  if (!profile) throw new LocalDatabaseError('Account profile was not found.', 404);
  const now = new Date().toISOString();
  const nextPasswordHash = updates.password === undefined ? undefined : passwordHash(updates.password);

  try {
    await runLocalTransaction(async (transaction) => {
      const result = database.prepare(`
        UPDATE auth_accounts
        SET email = ?, password_hash = COALESCE(?, password_hash), updated_at = ?
        WHERE user_id = ?
      `).run(email, nextPasswordHash ?? null, now, userId);
      if (Number(result.changes) !== 1) throw new LocalDatabaseError('Local account was not found.', 404);
      await transaction.update('users', profile.id, { email, updatedAt: now });
      if (updates.password !== undefined || emailChanged) {
        const currentSessionHash = updates.currentSessionToken
          ? digestToken(updates.currentSessionToken)
          : null;
        if (currentSessionHash) {
          database.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?')
            .run(userId, currentSessionHash);
        } else {
          database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
        }
        database.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new LocalDatabaseError('An account with this email already exists.', 409);
    }
    throw error;
  }
  return { email };
}

export async function signOutSession(sessionToken: string): Promise<void> {
  getDatabase().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(digestToken(sessionToken));
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const database = getDatabase();
  database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
  database.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  database.prepare('DELETE FROM auth_accounts WHERE user_id = ?').run(userId);
}

export async function setAuthUserDisabled(userId: string, disabled: boolean): Promise<void> {
  getDatabase().prepare('UPDATE auth_accounts SET is_enabled = ?, updated_at = ? WHERE user_id = ?')
    .run(disabled ? 0 : 1, new Date().toISOString(), userId);
}

export async function findAuthUserByEmail(emailInput: string): Promise<AuthenticatedLocalUser | null> {
  const email = normalizeEmail(emailInput);
  const account = getDatabase().prepare('SELECT * FROM auth_accounts WHERE email = ? COLLATE NOCASE')
    .get(email) as AccountRow | undefined;
  if (!account) return null;
  const user = await userRepo.findById(account.user_id);
  return user ? publicAuthUser(account, user) : null;
}

export async function createUserSession(userId: string): Promise<string> {
  const account = accountForUser(userId);
  if (!account) throw new LocalDatabaseError('Local account was not found.', 404);
  return createSession(userId);
}

export async function recordGuestDevice(deviceKey: string, userId: string): Promise<void> {
  const { LocalRepository } = await import('../db/repository.js');
  try {
    await new LocalRepository<{ id: string; userId: string }>('GuestDevice').create(deviceKey, { userId });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && Number((error as { code: unknown }).code) === 409) {
      throw Object.assign(new Error('Guest device has already been registered.'), { code: 409 });
    }
    throw error;
  }
}
