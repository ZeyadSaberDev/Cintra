import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasReachedDailyMessageLimit, ownsConversation, resolveDailyMessageLimit } from '../lib/chat/requestPolicy.js';

test('conversation ownership rejects other users and missing owner identities', () => {
  assert.equal(ownsConversation('user-1', 'user-1'), true);
  assert.equal(ownsConversation('user-2', 'user-1'), false);
  assert.equal(ownsConversation(undefined, 'user-1'), false);
});

test('daily message limit rejects at the limit without a permissive fallback', () => {
  assert.equal(hasReachedDailyMessageLimit(49, 50), false);
  assert.equal(hasReachedDailyMessageLimit(50, 50), true);
  assert.equal(hasReachedDailyMessageLimit(51, 50), true);
});

test('daily message limits prefer per-user overrides and retain the free-plan default', () => {
  assert.equal(resolveDailyMessageLimit('free', null, 50), 50);
  assert.equal(resolveDailyMessageLimit('free', 10, 50), 10);
  assert.equal(resolveDailyMessageLimit('pro', 25, 50), 25);
  assert.equal(resolveDailyMessageLimit('pro', null, 50), null);
  assert.equal(resolveDailyMessageLimit('pro', 0, 50), 0);
});
