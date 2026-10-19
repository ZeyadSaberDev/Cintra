import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMathDelimiters, parseInteractiveOptions } from '../lib/messageContent.js';

test('parses checkbox questions and an explicit action button', () => {
  const blocks = parseInteractiveOptions([
    'اختر الإجابة المناسبة:',
    '1. ما ناتج 2 + 2؟',
    '- [ ] 3',
    '- [ ] 4',
    'زر: تأكيد الإجابة',
    'يمكنك تغيير اختيارك قبل الإرسال.',
  ].join('\n'));

  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[1], {
    kind: 'options',
    questions: [{ prompt: 'ما ناتج 2 + 2؟', options: ['3', '4'] }],
    action: 'تأكيد الإجابة',
  });
  assert.equal(blocks[2].kind, 'markdown');
});

test('does not turn ordinary numbered prose into an interactive card', () => {
  const source = '1. افتح الإعدادات\n2. اختر الحساب';
  assert.deepEqual(parseInteractiveOptions(source), [{ kind: 'markdown', content: source }]);
});

test('normalizes parenthesized LaTeX delimiters', () => {
  assert.equal(normalizeMathDelimiters(String.raw`\(f(x)=\frac{1}{x}\) and \[x^2\]`), '$f(x)=\\frac{1}{x}$ and $$\nx^2\n$$');
});
