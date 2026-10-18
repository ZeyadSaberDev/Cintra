import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRequestOrigin } from '../lib/http/origin.js';

function request(headers: Record<string, string>, protocol = 'http', secure = false) {
  return {
    protocol,
    secure,
    get: (name: string) => headers[name.toLowerCase()],
  };
}

test('uses the forwarded public origin behind a reverse proxy', () => {
  assert.equal(
    getRequestOrigin(request({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'bayan-ai-production.up.railway.app',
      host: 'localhost:3000',
    })),
    'https://bayan-ai-production.up.railway.app',
  );
});

test('uses the first forwarded origin when proxy headers contain a chain', () => {
  assert.equal(
    getRequestOrigin(request({
      'x-forwarded-proto': 'https, http',
      'x-forwarded-host': 'bayan.example.com, internal-proxy',
    })),
    'https://bayan.example.com',
  );
});

test('falls back to the direct request origin when proxy headers are absent', () => {
  assert.equal(getRequestOrigin(request({ host: 'localhost:3001' })), 'http://localhost:3001');
});

test('rejects malformed or unsupported request origins', () => {
  assert.equal(getRequestOrigin(request({ host: 'bayan.example.com/path' })), null);
  assert.equal(getRequestOrigin(request({ 'x-forwarded-proto': 'javascript', host: 'bayan.example.com' })), null);
});
