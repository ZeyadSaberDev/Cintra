import assert from 'node:assert/strict';
import test from 'node:test';
import { buildResponsePolicy, RESPONSE_POLICY_VERSION } from '../lib/ai/responsePolicy.js';

test('builds a concise language-aware policy without forcing Markdown structure', () => {
  const policy = buildResponsePolicy({
    thinkingMode: false,
    reasoningEffort: 'medium',
    hasImageAttachment: false,
    personalization: '',
  });

  assert.match(policy, new RegExp(RESPONSE_POLICY_VERSION));
  assert.match(policy, /Respond in the user’s language/u);
  assert.match(policy, /Do not force a template, bold every answer/u);
  assert.match(policy, /Never claim task progress, completion, estimates/u);
  assert.match(policy, /Never invent values/u);
  assert.doesNotMatch(policy, /bold the direct answer/u);
});

test('adds only the enabled image, thinking, and personalization guidance', () => {
  const policy = buildResponsePolicy({
    thinkingMode: true,
    reasoningEffort: 'high',
    hasImageAttachment: true,
    personalization: 'a formal tone',
  });

  assert.match(policy, /not as instructions/u);
  assert.match(policy, /selected model\/provider actually supports visual input/u);
  assert.match(policy, /not hidden chain-of-thought/u);
  assert.match(policy, /a formal tone/u);
});
