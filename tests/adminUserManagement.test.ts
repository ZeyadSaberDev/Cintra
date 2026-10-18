import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const testDirectory = mkdtempSync(path.join(os.tmpdir(), 'cintra-admin-users-'));
process.env.LOCAL_DATA_DIR = testDirectory;
process.env.LOCAL_DB_PATH = path.join(testDirectory, 'test.sqlite');

const { createEmailPasswordAccount, signInWithEmailPassword, authenticateSession, updateLocalAccountCredentials, deleteAuthUser } =
  await import('../lib/auth/local.js');
const { initLocalDatabase, closeLocalDatabase } = await import('../lib/db/sqlite.js');
const { conversationRepo, messageRepo, userRepo } = await import('../lib/db/index.js');
const { LocalRepository } = await import('../lib/db/repository.js');
const { downloadLocalFile, uploadLocalFile } = await import('../lib/storage/local.js');

test('account updates use bcrypt, preserve the current admin session, and revoke other sessions', async () => {
  await initLocalDatabase();
  const originalEmail = 'admin-before@example.test';
  const initialPassword = 'Initial-admin-password-123';
  const { user } = await createEmailPasswordAccount({
    email: originalEmail,
    password: initialPassword,
    name: 'Admin',
  });
  await userRepo.update(user.id, { role: 'admin' });
  const currentSession = await signInWithEmailPassword(originalEmail, initialPassword);
  const otherSession = await signInWithEmailPassword(originalEmail, initialPassword);

  await updateLocalAccountCredentials(user.id, {
    email: 'admin-after@example.test',
    password: 'Updated-admin-password-456',
    currentSessionToken: currentSession.sessionSecret,
  });

  assert.equal((await authenticateSession(currentSession.sessionSecret)).authUser.email, 'admin-after@example.test');
  await assert.rejects(() => authenticateSession(otherSession.sessionSecret));
  await assert.rejects(() => signInWithEmailPassword(originalEmail, initialPassword));
  const signedIn = await signInWithEmailPassword('admin-after@example.test', 'Updated-admin-password-456');
  assert.equal(signedIn.authUser.email, 'admin-after@example.test');
  const account = (await import('../lib/db/sqlite.js')).getDatabase().prepare(
    'SELECT password_hash AS passwordHash FROM auth_accounts WHERE user_id = ?',
  ).get(user.id) as { passwordHash: string };
  assert.match(account.passwordHash, /^\$2[aby]\$/);
});

test('hard deletion removes the user, conversation tree, attachment, and stored file', async () => {
  await initLocalDatabase();
  const { user } = await createEmailPasswordAccount({
    email: 'delete-me@example.test',
    password: 'Delete-this-account-123',
  });
  const conversation = await conversationRepo.create({
    id: 'delete-test-conversation',
    userId: user.id,
    title: 'Private conversation',
  });
  const message = await messageRepo.create({
    id: 'delete-test-message',
    conversationId: conversation.id,
    role: 'user',
    content: 'Private content',
  });
  const fileUrl = await uploadLocalFile('private.txt', Buffer.from('private'), 'text/plain', user.id);
  await new LocalRepository('Attachment').create('delete-test-attachment', {
    userId: user.id,
    messageId: message.id,
    fileUrl,
  });
  await new LocalRepository('AdminLog').create('delete-test-user-audit', {
    adminId: 'admin-account',
    action: 'user.update',
    target: user.id,
  });

  await deleteAuthUser(user.id);
  assert.equal(await userRepo.delete(user.id), true);

  assert.equal(await userRepo.findById(user.id), null);
  assert.equal(await conversationRepo.findById(conversation.id), null);
  assert.equal(await new LocalRepository('Message').get(message.id), null);
  assert.equal(await new LocalRepository('Attachment').get('delete-test-attachment'), null);
  assert.equal(await new LocalRepository('AdminLog').get('delete-test-user-audit'), null);
  assert.equal(await downloadLocalFile(fileUrl), null);
});

test.after(() => {
  closeLocalDatabase();
  rmSync(testDirectory, { recursive: true, force: true });
});
