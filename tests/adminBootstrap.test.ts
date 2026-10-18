import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const directory = mkdtempSync(path.join(os.tmpdir(), 'cintra-admin-bootstrap-'));
process.env.LOCAL_DATA_DIR = directory;
process.env.LOCAL_DB_PATH = path.join(directory, 'test.sqlite');
process.env.ADMIN_EMAIL = 'bootstrap-admin@example.test';
process.env.ADMIN_BOOTSTRAP_PASSWORD = 'Bootstrap-password-first-123';
process.env.ADMIN_SESSION_SECRET = 'bootstrap-test-session-secret-that-is-long-enough';
process.env.ADMIN_ACCESS_KEY = 'bootstrap-test-key-that-is-long-enough-123';
process.env.FREELLMAPI_API_KEY = '';

const { initLocalDatabase, closeLocalDatabase } = await import('../lib/db/sqlite.js');
const { userRepo } = await import('../lib/db/index.js');
const { createEmailPasswordAccount, signInWithEmailPassword } = await import('../lib/auth/local.js');
const { initializeAdminRuntimeConfig } = await import('../lib/admin/router.js');

test('bootstrap rotates an existing admin password once when the configured secret changes', async () => {
  await initLocalDatabase();
  const initial = await createEmailPasswordAccount({
    email: process.env.ADMIN_EMAIL!,
    password: 'Previous-admin-password-123',
  });
  await userRepo.update(initial.user.id, { role: 'admin' });

  await initializeAdminRuntimeConfig();
  await signInWithEmailPassword(process.env.ADMIN_EMAIL!, process.env.ADMIN_BOOTSTRAP_PASSWORD!);

  process.env.ADMIN_BOOTSTRAP_PASSWORD = 'Bootstrap-password-rotated-456';
  await initializeAdminRuntimeConfig();
  await assert.rejects(() => signInWithEmailPassword(process.env.ADMIN_EMAIL!, 'Bootstrap-password-first-123'));
  await signInWithEmailPassword(process.env.ADMIN_EMAIL!, process.env.ADMIN_BOOTSTRAP_PASSWORD);

  await initializeAdminRuntimeConfig();
  await signInWithEmailPassword(process.env.ADMIN_EMAIL!, process.env.ADMIN_BOOTSTRAP_PASSWORD);
});

test.after(() => {
  closeLocalDatabase();
  rmSync(directory, { recursive: true, force: true });
});
