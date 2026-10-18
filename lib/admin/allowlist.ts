import { LocalRepository, runLocalTransaction } from '../db/repository.js';
import { localDocumentId } from '../db/repository.js';

const allowlist = new LocalRepository<{
  id: string;
  email: string;
  isActive: boolean;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt?: string;
}>('AdminAllowlist');

export interface AdminAllowlistEntry {
  email: string;
  isActive: boolean;
  createdAt: string | null;
  createdBy: string | null;
}

export async function isAdminEmailAllowed(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;
  const entry = await allowlist.get(normalizedEmail);
  return Boolean(entry && entry.isActive !== false);
}

export async function listAdminEmails(): Promise<AdminAllowlistEntry[]> {
  const rows = await allowlist.list();
  return rows.map((row) => ({
    email: row.email.toLowerCase(),
    isActive: row.isActive !== false,
    createdAt: row.createdAt && Number.isFinite(Date.parse(row.createdAt))
      ? new Date(row.createdAt).toISOString()
      : null,
    createdBy: typeof row.createdBy === 'string' ? row.createdBy : null,
  })).sort((left, right) => (left.createdAt || '').localeCompare(right.createdAt || ''));
}

export async function addAdminEmail(email: string, createdBy: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const id = localDocumentId(normalizedEmail);
  await runLocalTransaction(async (transaction) => {
    const existing = await transaction.get('adminAllowlist', id);
    if (existing && existing.isActive !== false) {
      throw Object.assign(new Error('Administrator email is already active.'), { code: 'already-exists' });
    }
    const row = {
      email: normalizedEmail,
      isActive: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
      createdBy: existing?.createdBy || createdBy,
      updatedAt: new Date().toISOString(),
    };
    if (existing) await transaction.update('adminAllowlist', id, row);
    else await transaction.create('adminAllowlist', id, row);
  });
}

export async function removeAdminEmail(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const id = localDocumentId(normalizedEmail);
  return runLocalTransaction(async (transaction) => {
    const existing = await transaction.get('adminAllowlist', id);
    if (!existing || existing.isActive === false) return false;
    await transaction.update('adminAllowlist', id, { isActive: false, updatedAt: new Date().toISOString() });
    return true;
  });
}
