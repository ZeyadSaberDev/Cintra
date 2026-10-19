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

test('parses numbered questions with bullet choices and a trailing action', () => {
  const blocks = parseInteractiveOptions([
    'قبل الاختيارات، اختر الأنسب:',
    '1. عايز تعمل نسخة من إيه؟',
    '• نسخة احتياطية من ويندوز والبرامج',
    '• نسخة كاملة من الهارد إلى هارد آخر',
    '',
    '2. إيه هدف النسخة؟',
    '• نسخة احتياطية للملفات',
    '• نقل كل شيء إلى جهاز جديد',
    'اشرح لي الخطوات',
    'وسأوضح لك الطريقة المناسبة بالتفصيل.',
  ].join('\n'));

  assert.equal(blocks[0].kind, 'markdown');
  assert.deepEqual(blocks[1], {
    kind: 'options',
    questions: [
      {
        prompt: 'عايز تعمل نسخة من إيه؟',
        options: ['نسخة احتياطية من ويندوز والبرامج', 'نسخة كاملة من الهارد إلى هارد آخر'],
      },
      {
        prompt: 'إيه هدف النسخة؟',
        options: ['نسخة احتياطية للملفات', 'نقل كل شيء إلى جهاز جديد'],
      },
    ],
    action: 'اشرح لي الخطوات',
  });
  assert.deepEqual(blocks[2], { kind: 'markdown', content: 'وسأوضح لك الطريقة المناسبة بالتفصيل.' });
});

test('parses checkbox and radio glyph choices following numbered prompts', () => {
  const blocks = parseInteractiveOptions([
    '1. Choose one',
    '○ First',
    '◯ Second',
    '2. Confirm choice',
    '- [ ] Yes',
    '- [ ] No',
  ].join('\n'));

  assert.deepEqual(blocks, [{
    kind: 'options',
    questions: [
      { prompt: 'Choose one', options: ['First', 'Second'] },
      { prompt: 'Confirm choice', options: ['Yes', 'No'] },
    ],
    action: null,
  }]);
});

test('normalizes parenthesized LaTeX delimiters', () => {
  assert.equal(normalizeMathDelimiters(String.raw`\(f(x)=\frac{1}{x}\) and \[x^2\]`), '$f(x)=\\frac{1}{x}$ and $$\nx^2\n$$');
});
