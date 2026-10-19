import assert from 'node:assert/strict';
import test from 'node:test';
import { groupModelsByFamily, normalizePublicModelCatalog } from '../src/lib/modelGrouping.js';

test('groups same model families together without exposing unknown provider labels', () => {
  const groups = groupModelsByFamily([
    { id: 'claude-sonnet', name: 'Claude Sonnet', group: 'Claude' },
    { id: 'claude-opus', name: 'Claude Opus', group: 'Claude' },
    { id: 'gpt-5', name: 'GPT 5', group: 'OpenAI' },
    { id: 'private-model', name: 'Private model', group: 'private connection' },
  ]);

  assert.deepEqual(groups.map(({ family }) => family), ['Claude', 'OpenAI', 'Other']);
  assert.deepEqual(groups[0].models.map(({ id }) => id), ['claude-sonnet', 'claude-opus']);
  assert.equal(groups[2].family, 'Other');
});

test('normalizes public model catalogs, skips duplicates, and drops secret fields', () => {
  const models = normalizePublicModelCatalog([
    {
      id: 'public-model',
      name: 'Public Model',
      provider: 'OpenAI',
      description: 'Configured model',
      costTier: 'high',
      apiKey: 'must-not-reach-the-browser',
    },
    { id: 'public-model', name: 'Duplicate', provider: 'Other' },
    { id: 'invalid\nmodel', name: 'Invalid', provider: 'Other' },
    { id: 'missing-provider', name: 'Missing provider' },
    { id: 'unknown-provider-model', name: 'Unknown provider', provider: 'Internal Secret Provider' },
  ]);

  assert.deepEqual(models, [
    {
      id: 'public-model',
      name: 'Public Model',
      provider: 'OpenAI',
      description: 'Configured model',
      costTier: 'High',
    },
    {
      id: 'unknown-provider-model',
      name: 'Unknown provider',
      provider: 'Other',
    },
  ]);
  assert.equal(JSON.stringify(models).includes('must-not-reach-the-browser'), false);
});

test('preserves only explicitly declared model capabilities and never infers them from names', () => {
  const models = normalizePublicModelCatalog([
    {
      id: 'vision-route',
      name: 'Vision Route',
      provider: 'OpenAI',
      capabilities: { visionInput: true, toolCalling: false, structuredOutput: 'yes', apiKey: 'secret' },
    },
    { id: 'plain-route', name: 'GPT Vision Preview', provider: 'OpenAI' },
  ]);

  assert.deepEqual(models.map(({ capabilities }) => capabilities), [
    { visionInput: true, toolCalling: false },
    undefined,
  ]);
  assert.equal(JSON.stringify(models).includes('secret'), false);
});
