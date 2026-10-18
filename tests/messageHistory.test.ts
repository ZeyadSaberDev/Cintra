import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AI_CONTEXT_MESSAGE_LIMIT,
  chronologicalContext,
  conversationContextQuery,
  historyThroughEditedMessage,
  markHistoryBeforeEdits,
} from '../lib/chat/messageHistory.js';

test('AI conversation history query reads only the newest context window', () => {
  const query = conversationContextQuery('conversation-1');
  assert.equal(query.limit, AI_CONTEXT_MESSAGE_LIMIT);
  assert.equal(query.limit, 10);
  assert.deepEqual(query.orderBy, [
    { field: 'createdAt', direction: 'desc' },
    { field: 'id', direction: 'desc' },
  ]);
  assert.deepEqual(query.filters, [{ field: 'conversationId', op: '==', value: 'conversation-1' }]);
});

test('AI context query uses the edited message as an inclusive cursor and returns chronology', () => {
  const query = conversationContextQuery('conversation-1', {
    id: 'user-12',
    createdAt: '2026-01-01T12:00:00.000Z',
  });
  assert.deepEqual(query.startAtValues, ['2026-01-01T12:00:00.000Z', 'user-12']);
  assert.deepEqual(chronologicalContext(['newest', 'older', 'oldest']), ['oldest', 'older', 'newest']);
});

test('edited request context ends at the edited message without removing stored history', () => {
  const messages = [
    { id: 'user-1', role: 'user' as const },
    { id: 'assistant-1', role: 'assistant' as const },
    { id: 'user-2', role: 'user' as const },
    { id: 'assistant-2', role: 'assistant' as const },
  ];

  assert.deepEqual(
    historyThroughEditedMessage(messages, 'user-2').map(({ id }) => id),
    ['user-1', 'assistant-1', 'user-2'],
  );
  assert.equal(messages.length, 4);
  assert.equal(historyThroughEditedMessage(messages, 'missing'), messages);
});

test('history after an edited message stays visible as prior history, not current output', () => {
  const messages = [
    { id: 'user-1', role: 'user' as const, createdAt: '2026-01-01T10:00:00.000Z', editedAt: '2026-01-01T10:05:00.000Z' },
    { id: 'assistant-1', role: 'assistant' as const, createdAt: '2026-01-01T10:01:00.000Z' },
    { id: 'user-2', role: 'user' as const, createdAt: '2026-01-01T10:02:00.000Z' },
    { id: 'assistant-2', role: 'assistant' as const, createdAt: '2026-01-01T10:06:00.000Z' },
  ];

  assert.deepEqual(
    markHistoryBeforeEdits(messages).map(({ isPriorHistory }) => isPriorHistory),
    [false, true, true, false],
  );
  assert.equal(messages.length, 4);
});
