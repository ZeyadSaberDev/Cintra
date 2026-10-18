import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cachedAdminSetting,
  cachedAdminSettingStrict,
  guestLoginAllowed,
  invalidateAdminSetting,
  isTransientAdminSettingReadError,
} from '../lib/admin/settingsCache.js';

test('recognizes transient service HTTP status codes', () => {
  assert.equal(isTransientAdminSettingReadError({ code: 503 }), true);
  assert.equal(isTransientAdminSettingReadError({ code: 429 }), true);
});

test('recognizes transient network errors and wrapped service errors', () => {
  assert.equal(isTransientAdminSettingReadError({ code: 'ETIMEDOUT' }), true);
  assert.equal(isTransientAdminSettingReadError(new Error('Request timeout.')), true);
});

test('recognizes wrapped temporary database errors', () => {
  assert.equal(isTransientAdminSettingReadError({
    cause: { code: 503 },
  }), true);
});

test('does not treat permanent database errors as temporary', () => {
  assert.equal(isTransientAdminSettingReadError({ code: 'PERMISSION_DENIED' }), false);
});

test('fails closed when guest access policy cannot be read', async () => {
  await assert.rejects(guestLoginAllowed(async () => { throw { code: 503 }; }));
});

test('does not use a stale admin setting after a permanent database failure', async () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    await cachedAdminSetting('test-permanent-error', async () => 'secret-configured');
    now += 10_001;
    await assert.rejects(
      cachedAdminSetting('test-permanent-error', async () => { throw { code: 403 }; }),
      (error: unknown) => Boolean(error && typeof error === 'object'
        && 'code' in error && error.code === 403),
    );
  } finally {
    Date.now = originalNow;
    invalidateAdminSetting('test-permanent-error');
  }
});

test('does not use a stale policy setting after a transient database failure', async () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    await cachedAdminSettingStrict('test-policy-setting', async () => 'current-policy');
    now += 10_001;
    await assert.rejects(
      cachedAdminSettingStrict('test-policy-setting', async () => { throw { code: 503 }; }),
      (error: unknown) => Boolean(error && typeof error === 'object'
        && 'code' in error && error.code === 503),
    );
  } finally {
    Date.now = originalNow;
    invalidateAdminSetting('test-policy-setting');
  }
});

test('policy cache does not consume stale values retained by the non-policy cache', async () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    await cachedAdminSetting('test-policy-isolation', async () => 'old-permissive-value');
    now += 10_001;
    assert.equal(
      await cachedAdminSetting('test-policy-isolation', async () => { throw { code: 503 }; }),
      'old-permissive-value',
    );
    await assert.rejects(
      cachedAdminSettingStrict('test-policy-isolation', async () => { throw { code: 503 }; }),
      (error: unknown) => Boolean(error && typeof error === 'object'
        && 'code' in error && error.code === 503),
    );
  } finally {
    Date.now = originalNow;
    invalidateAdminSetting('test-policy-isolation');
  }
});
