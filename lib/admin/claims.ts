import {
  deleteAuthUser,
  findAuthUserByEmail,
  setAuthUserDisabled,
  type AuthenticatedLocalUser,
} from '../auth/local.js';
import { userRepo } from '../db/index.js';

export async function findLocalUserByEmail(email: string): Promise<AuthenticatedLocalUser | null> {
  return findAuthUserByEmail(email);
}

export async function findLocalUserForProfile(profile: {
  authUserId?: unknown;
  email?: unknown;
  id?: unknown;
}): Promise<AuthenticatedLocalUser | null> {
  const userId = typeof profile.authUserId === 'string' && profile.authUserId
    ? profile.authUserId
    : typeof profile.id === 'string' && profile.id
      ? profile.id
      : null;
  if (userId) {
    const user = await userRepo.findById(userId);
    if (user?.email) return findAuthUserByEmail(user.email);
  }
  return typeof profile.email === 'string' && profile.email.trim()
    ? findAuthUserByEmail(profile.email)
    : null;
}

export async function grantAdminRole(userId: string): Promise<void> {
  const authUser = await findLocalUserForProfile({ id: userId });
  if (!authUser) throw new Error('Local account was not found.');
  if (!authUser.emailVerification) throw new Error('The account email is not verified.');
  if (!authUser.status) throw new Error('The account is disabled.');
  const profile = await userRepo.findByAuthId(authUser.$id);
  if (!profile) throw new Error('The account profile was not found.');
  await userRepo.update(profile.id, { role: 'admin' });
}

export async function revokeAdminRole(userId: string): Promise<void> {
  const profile = await userRepo.findByAuthId(userId);
  if (profile?.role === 'admin') await userRepo.update(profile.id, { role: 'user' });
}

export async function disableLocalUser(userId: string, disabled: boolean): Promise<void> {
  await setAuthUserDisabled(userId, disabled);
}

export async function deleteLocalUser(userId: string): Promise<void> {
  await deleteAuthUser(userId);
}
