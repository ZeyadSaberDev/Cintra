import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runProviderDiagnostics } from '../lib/ai/providerDiagnostics.js';

test('provider diagnostics failures are reported without blocking the AI result', async () => {
  const reported: string[] = [];
  const response = await Promise.resolve('provider response').then((result) => {
    runProviderDiagnostics([
      { label: 'quota metric', run: async () => { throw new Error('Provider quota exhausted'); } },
      { label: 'successful metric', run: async () => undefined },
    ], (label, error) => {
      assert.match(String(error), /Provider quota exhausted/);
      reported.push(label);
    });
    return result;
  });

  assert.equal(response, 'provider response');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reported, ['quota metric']);
});
