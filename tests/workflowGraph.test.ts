import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkflowExecutionOrder } from '../lib/agent/workflowGraph.js';

const nodes = [
  { id: 'input', kind: 'input' },
  { id: 'search', kind: 'search' },
  { id: 'writer', kind: 'agent' },
  { id: 'pdf', kind: 'pdf' },
  { id: 'output', kind: 'output' },
];

test('orders connected workflow nodes before execution', () => {
  assert.deepEqual(createWorkflowExecutionOrder(nodes, [
    { source: 'input', target: 'search' },
    { source: 'search', target: 'writer' },
    { source: 'writer', target: 'pdf' },
    { source: 'pdf', target: 'output' },
  ]), ['input', 'search', 'writer', 'pdf', 'output']);
});

test('rejects cyclic and disconnected workflow graphs', () => {
  assert.throws(
    () => createWorkflowExecutionOrder(nodes, [
      { source: 'input', target: 'search' },
      { source: 'search', target: 'writer' },
      { source: 'writer', target: 'search' },
      { source: 'writer', target: 'pdf' },
      { source: 'pdf', target: 'output' },
    ]),
    /must not contain a cycle/,
  );
  assert.throws(
    () => createWorkflowExecutionOrder([...nodes, { id: 'orphan', kind: 'agent' }], [
      { source: 'input', target: 'search' },
      { source: 'search', target: 'writer' },
      { source: 'writer', target: 'pdf' },
      { source: 'pdf', target: 'output' },
    ]),
    /Connect every workflow node/,
  );
});

test('rejects invalid workflow input and output structure', () => {
  assert.throws(() => createWorkflowExecutionOrder(nodes.slice(1), []), /exactly one input node/);
  assert.throws(
    () => createWorkflowExecutionOrder(nodes, [{ source: 'input', target: 'missing' }]),
    /existing nodes/,
  );
});
