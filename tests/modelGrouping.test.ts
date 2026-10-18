import assert from 'node:assert/strict';
import test from 'node:test';
import { groupModelsByFamily } from '../src/lib/modelGrouping.js';

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
