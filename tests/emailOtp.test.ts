import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emailOtpDigest,
  evaluateEmailOtpAttempt,
  type EmailOtpChallenge,
} from '../lib/auth/emailOtp.js';

const email = 'otp-user@example.com';
const secret = 'test-secret-that-is-at-least-thirty-two-characters';
const validCode = '042731';
const now = 1_800_000_000_000;

function challenge(code = validCode, overrides: Partial<EmailOtpChallenge> = {}): EmailOtpChallenge {
  return {
    uid: 'existing-local-user',
    codeHash: emailOtpDigest(email, code, secret),
    expiresAtMs: now + 10 * 60_000,
    attempts: 0,
    ...overrides,
  };
}

test('accepts the correct code and resolves its existing user', () => {
  assert.deepEqual(
    evaluateEmailOtpAttempt(challenge(), emailOtpDigest(email, validCode, secret), now),
    { status: 'success', uid: 'existing-local-user' },
  );
});

test('rejects an incorrect code and increments its attempt count', () => {
  assert.deepEqual(
    evaluateEmailOtpAttempt(challenge(), emailOtpDigest(email, '000000', secret), now),
    { status: 'invalid', attempts: 1 },
  );
});

test('rejects an expired code', () => {
  assert.deepEqual(
    evaluateEmailOtpAttempt(challenge(validCode, { expiresAtMs: now }), emailOtpDigest(email, validCode, secret), now),
    { status: 'expired' },
  );
});

test('a successful code is single-use', () => {
  let pending: EmailOtpChallenge | null = challenge();
  const first = evaluateEmailOtpAttempt(pending, emailOtpDigest(email, validCode, secret), now);
  if (first.status === 'success') pending = null;
  assert.equal(first.status, 'success');
  assert.equal(pending, null);
  const second = pending
    ? evaluateEmailOtpAttempt(pending, emailOtpDigest(email, validCode, secret), now)
    : { status: 'invalid' };
  assert.equal(second.status, 'invalid');
});

test('locks the code after five incorrect attempts', () => {
  let current = challenge();
  const wrongHash = emailOtpDigest(email, '000000', secret);
  for (let attempt = 1; attempt < 5; attempt += 1) {
    const result = evaluateEmailOtpAttempt(current, wrongHash, now);
    assert.equal(result.status, 'invalid');
    if (result.status === 'invalid') current = { ...current, attempts: result.attempts };
  }
  assert.deepEqual(evaluateEmailOtpAttempt(current, wrongHash, now), { status: 'rate-limited' });
});

test('a newly issued code invalidates the previous code', () => {
  const replacement = challenge('951804');
  assert.equal(
    evaluateEmailOtpAttempt(replacement, emailOtpDigest(email, validCode, secret), now).status,
    'invalid',
  );
  assert.equal(
    evaluateEmailOtpAttempt(replacement, emailOtpDigest(email, '951804', secret), now).status,
    'success',
  );
});
