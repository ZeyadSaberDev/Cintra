import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeCurrencyDelimiters,
  parseInlineChartSpec,
  selectResponseLayout,
} from '../lib/ai/responseLayout.js';

test('selects layouts from meaningful response structure without forcing cards', () => {
  assert.equal(selectResponseLayout('The application installs in a few minutes.'), 'standard');
  assert.equal(selectResponseLayout('## Overview\nA concise explanation.'), 'structured');
  assert.equal(selectResponseLayout('1. Download the installer\n2. Run it'), 'tutorial');
  assert.equal(selectResponseLayout('١. نزّل التطبيق\n٢. شغّل ملف التثبيت'), 'tutorial');
  assert.equal(selectResponseLayout('## Project plan\n- Phase 1: Setup'), 'plan');
  assert.equal(selectResponseLayout('## خطة التنفيذ\n- المرحلة الأولى'), 'plan');
  assert.equal(selectResponseLayout('| Feature | A |\n| --- | --- |\n| Cost | Low |'), 'comparison');
  assert.equal(selectResponseLayout('The result is $f(x) = x^2$.'), 'mathematical');
  assert.equal(selectResponseLayout('```ts\nconst value = 1;\n```'), 'programming');
  assert.equal(selectResponseLayout('```mermaid\ngraph TD; A --> B\n```'), 'programming');
});

test('does not misclassify currency, code samples, or code-contained Markdown', () => {
  assert.equal(selectResponseLayout('The fee is $5 and the total is $1,200.00.'), 'standard');
  assert.equal(selectResponseLayout('Example: `$5` is a string and `1. Install` is code.'), 'standard');
  assert.equal(selectResponseLayout('```md\n| A | B |\n| --- | --- |\n$5\n```'), 'programming');
  assert.equal(
    escapeCurrencyDelimiters('Pay $5 or $1,200.00, but keep $x^2$ and `$5` unchanged.'),
    'Pay \\$5 or \\$1,200.00, but keep $x^2$ and `$5` unchanged.',
  );
  assert.equal(
    escapeCurrencyDelimiters('```\nconst price = "$5";\n```\n$5'),
    '```\nconst price = "$5";\n```\n\\$5',
  );
});

test('validates bounded chart specifications and rejects malformed or unsafe data', () => {
  const valid = parseInlineChartSpec(JSON.stringify({
    type: 'bar',
    title: 'Monthly usage',
    description: 'Actual values from the supplied report.',
    labels: ['Jan', 'Feb'],
    series: [{ name: 'Requests', values: [12, 18] }],
  }));

  assert.deepEqual(valid?.series[0].values, [12, 18]);
  assert.equal(parseInlineChartSpec('{"type":"pie"}'), null);
  assert.equal(parseInlineChartSpec(JSON.stringify({
    type: 'line',
    title: 'Invalid',
    description: 'Mismatched labels and values.',
    labels: ['Jan', 'Feb'],
    series: [{ name: 'Requests', values: [1] }],
  })), null);
  assert.equal(parseInlineChartSpec(JSON.stringify({
    type: 'bar',
    title: 'Invalid',
    description: 'Non-finite values are not rendered.',
    labels: ['Jan', 'Feb'],
    series: [{ name: 'Requests', values: [1, Number.NaN] }],
  })), null);
});
