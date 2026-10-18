import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldUseThinkingMode } from '../lib/chat/complexity.js';

test('long ordinary requests do not enable slow thinking mode by length alone', () => {
  const longRequest = Array.from({ length: 40 }, (_, index) => `ordinary${index}`).join(' ');
  assert.equal(shouldUseThinkingMode(longRequest), false);
});

test('explicitly complex requests still enable thinking mode', () => {
  assert.equal(shouldUseThinkingMode('Compare these two approaches and explain the trade-offs.'), true);
  assert.equal(shouldUseThinkingMode('حلل المشكلة واشرح الأسباب بالتفصيل.'), true);
});

test('simple greetings do not enable thinking mode', () => {
  assert.equal(shouldUseThinkingMode('مرحبا'), false);
  assert.equal(shouldUseThinkingMode('Thanks!'), false);
});
