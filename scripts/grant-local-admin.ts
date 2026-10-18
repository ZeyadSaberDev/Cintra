import 'dotenv/config';
import { addAdminEmail, removeAdminEmail } from '../lib/admin/allowlist.js';
import { findLocalUserForProfile, grantAdminRole } from '../lib/admin/claims.js';
import { findAuthUserByEmail } from '../lib/auth/local.js';
import { closeLocalDatabase, initLocalDatabase } from '../lib/db/sqlite.js';

async function main(): Promise<void> {
  await initLocalDatabase();
  const identifier = process.argv[2]?.trim() || process.env.ADMIN_EMAIL?.trim();
  const isEmail = Boolean(identifier && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier));
  if (!identifier || (!isEmail && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(identifier))) {
    throw new Error('Usage: npm run admin:grant -- <existing-account-email-or-id> (or set ADMIN_EMAIL).');
  }
  const user = isEmail
    ? await findAuthUserByEmail(identifier.toLowerCase())
    : await findLocalUserForProfile({ id: identifier });
  if (!user) throw new Error('Create the local account before granting administrator access.');
  if (!user.status || !user.emailVerification) {
    throw new Error('The local account must be enabled and email-verified first.');
  }
  const email = user.email.trim().toLowerCase();

  let createdAllowlistEntry = true;
  try {
    await addAdminEmail(email, 'local-bootstrap');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'already-exists')) throw error;
    createdAllowlistEntry = false;
  }
  try {
    await grantAdminRole(user.$id);
  } catch (error) {
    if (createdAllowlistEntry) {
      await removeAdminEmail(email).catch((rollbackError: unknown) => {
        console.error('Could not roll back the admin allowlist entry:', rollbackError);
      });
    }
    throw error;
  }
  console.info(`Administrator access granted to ${email}.`);
}

try {
  await main();
} catch (error) {
  console.error('Could not grant local administrator access:', error);
  process.exitCode = 1;
} finally {
  closeLocalDatabase();
}
