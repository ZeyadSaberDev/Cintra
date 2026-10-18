import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLocalCredentialError } from '../lib/auth/local.js';
import { DATA_SCHEMA } from '../lib/db/schema.js';
import { LocalDatabaseError, localDocumentId } from '../lib/db/repository.js';
import { localStorageId } from '../lib/storage/local.js';
import { UpdateProfileSchema } from '../lib/auth/index.js';

test('classifies only expected local authentication errors as invalid credentials', () => {
  for (const code of [400, 401, 404, 409]) {
    assert.equal(isLocalCredentialError(new LocalDatabaseError('Invalid credentials', code)), true);
  }
  assert.equal(isLocalCredentialError(new LocalDatabaseError('Service unavailable', 503)), false);
  assert.equal(isLocalCredentialError(new Error('Request failed')), false);
});

test('validates local storage references without accepting external URLs', () => {
  const reference = 'local://123e4567-e89b-12d3-a456-426614174000';
  assert.equal(localStorageId(reference), '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(localStorageId('https://example.test/file_123'), null);
  assert.throws(() => localStorageId('local://invalid id'));
});

test('generates stable local database IDs for arbitrary keys', () => {
  const first = localDocumentId('email@example.test');
  assert.match(first, /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/);
  assert.equal(first, localDocumentId('email@example.test'));
  assert.notEqual(first, localDocumentId('another@example.test'));
});

test('declares indexed ownership and relationship fields for core data collections', () => {
  assert.ok(DATA_SCHEMA.User.indexes.some((index) => index.includes('authUserId')));
  assert.equal(DATA_SCHEMA.User.fields.dailyMessageLimitOverride, 'integer');
  assert.ok(DATA_SCHEMA.Conversation.indexes.some((index) => index.includes('userId')));
  assert.ok(DATA_SCHEMA.Message.indexes.some((index) => index.includes('conversationId')));
  assert.ok(DATA_SCHEMA.Attachment.indexes.some((index) => index.includes('userId')));
  for (const definition of Object.values(DATA_SCHEMA)) {
    assert.equal(definition.fields.recordKey, 'string');
    assert.equal(definition.fields.payload, 'longtext');
  }
});

test('profile updates cannot assign administrator or server-owned account fields', () => {
  const parsed = UpdateProfileSchema.safeParse({
    name: 'Cintra User',
    role: 'admin',
    isBanned: true,
    creditBalance: 999999,
    emailVerified: '2026-10-09T00:00:00.000Z',
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data, { name: 'Cintra User' });
  }
});

test('profile highlight preferences accept only independent boolean values', () => {
  const parsed = UpdateProfileSchema.safeParse({
    highlightUserMessages: false,
    highlightAssistantAnswers: true,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data, {
      highlightUserMessages: false,
      highlightAssistantAnswers: true,
    });
  }
  assert.equal(UpdateProfileSchema.safeParse({ highlightUserMessages: 'off' }).success, false);
  assert.equal(UpdateProfileSchema.safeParse({ userMessageHighlightColor: '#12abEF' }).success, true);
  assert.equal(UpdateProfileSchema.safeParse({ assistantAnswerHighlightColor: 'red' }).success, false);
});
