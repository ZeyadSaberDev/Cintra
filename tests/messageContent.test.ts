import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMathDelimiters, parseInteractiveOptions, sanitizeMarkdownUrl } from '../lib/messageContent.js';

test('allows safe Markdown link schemes and rejects executable or network-path URLs', () => {
  assert.equal(sanitizeMarkdownUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(sanitizeMarkdownUrl('/api/attachments/file-1'), '/api/attachments/file-1');
  assert.equal(sanitizeMarkdownUrl('mailto:help@example.com'), 'mailto:help@example.com');
  assert.equal(sanitizeMarkdownUrl('javascript:alert(1)'), undefined);
  assert.equal(sanitizeMarkdownUrl('//example.com/image.png'), undefined);
  assert.equal(sanitizeMarkdownUrl('/\\\\example.com/image.png'), undefined);
});

test('restricts Markdown image sources to safe HTTP(S) or local paths', () => {
  assert.equal(sanitizeMarkdownUrl('https://example.com/image.png', 'image'), 'https://example.com/image.png');
  assert.equal(sanitizeMarkdownUrl('/api/attachments/image-1', 'image'), '/api/attachments/image-1');
  assert.equal(sanitizeMarkdownUrl('mailto:help@example.com', 'image'), undefined);
  assert.equal(sanitizeMarkdownUrl('data:image/svg+xml,<svg/>', 'image'), undefined);
});

test('parses an explicitly requested checkbox answer set and an action button', () => {
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
  const source = 'Here is how to install the application:\n1. Download the installer.\n2. Run the installer.';
  assert.deepEqual(parseInteractiveOptions(source), [{ kind: 'markdown', content: source }]);
});

test('keeps numbered troubleshooting instructions as ordinary Markdown', () => {
  const source = 'Troubleshooting guide:\n1. Restart the application.\n2. Check the network connection.\n3. Review the error log.';
  assert.deepEqual(parseInteractiveOptions(source), [{ kind: 'markdown', content: source }]);
});

test('keeps comparison tables as ordinary Markdown', () => {
  const source = [
    '| Option | Recommendation |',
    '| --- | --- |',
    '| A | Choose this for small projects. |',
    '| B | Select this for larger projects. |',
  ].join('\n');
  assert.deepEqual(parseInteractiveOptions(source), [{ kind: 'markdown', content: source }]);
});

test('does not parse question-shaped lines inside fenced code blocks as interactive options', () => {
  const source = [
    '```markdown',
    '1. Which option should the parser leave alone?',
    'Options:',
    '- First',
    '- Second',
    '```',
    '> Which OS are you using?',
    '> Options:',
    '> - Windows',
    '> - Android',
  ].join('\n');

  assert.deepEqual(parseInteractiveOptions(source), [{ kind: 'markdown', content: source }]);
});

test('parses explicit questions with labeled bullet choices and a trailing action', () => {
  const blocks = parseInteractiveOptions([
    'قبل الاختيارات، اختر الأنسب:',
    '1. عايز تعمل نسخة من إيه؟',
    'الخيارات:',
    '• نسخة احتياطية من ويندوز والبرامج',
    '• نسخة كاملة من الهارد إلى هارد آخر',
    '',
    '2. إيه هدف النسخة؟',
    'الخيارات:',
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
    '2. Which choice should be confirmed?',
    '- [ ] Yes',
    '- [ ] No',
  ].join('\n'));

  assert.deepEqual(blocks, [{
    kind: 'options',
    questions: [
      { prompt: 'Choose one', options: ['First', 'Second'] },
      { prompt: 'Which choice should be confirmed?', options: ['Yes', 'No'] },
    ],
    action: null,
  }]);
});

test('renders an explicit English question and its labeled answer choices interactively', () => {
  assert.deepEqual(parseInteractiveOptions([
    'Which operating system are you using?',
    'Options:',
    '- Windows',
    '- Android',
  ].join('\n')), [{
    kind: 'options',
    questions: [{ prompt: 'Which operating system are you using?', options: ['Windows', 'Android'] }],
    action: null,
  }]);
});

test('keeps an ambiguous question without an explicit choice set as ordinary Markdown', () => {
  const source = 'Which version should I install?\n\nVersion 1 is stable.\nVersion 2 is experimental.';
  assert.deepEqual(parseInteractiveOptions(source), [{ kind: 'markdown', content: source }]);

  const bulletList = 'Which version should I install?\n- Version 1\n- Version 2';
  assert.deepEqual(parseInteractiveOptions(bulletList), [{ kind: 'markdown', content: bulletList }]);
});

test('applies the same conservative rules to Arabic questions and instructions', () => {
  const question = parseInteractiveOptions([
    'ما نظام التشغيل الذي تستخدمه؟',
    'الخيارات:',
    '- ويندوز',
    '- أندرويد',
  ].join('\n'));
  assert.deepEqual(question, [{
    kind: 'options',
    questions: [{ prompt: 'ما نظام التشغيل الذي تستخدمه؟', options: ['ويندوز', 'أندرويد'] }],
    action: null,
  }]);

  const instructions = 'طريقة تثبيت التطبيق:\n١. نزّل الملف.\n٢. شغّل برنامج التثبيت.';
  assert.deepEqual(parseInteractiveOptions(instructions), [{ kind: 'markdown', content: instructions }]);
});

test('preserves ordinary answer Markdown unchanged when no explicit choices exist', () => {
  const source = [
    '## Installation steps',
    '',
    'Choose the recommended package, then:',
    '1. Download the installer.',
    '2. Follow the setup wizard.',
    '',
    '```sh',
    'npm install example',
    '```',
  ].join('\n');
  assert.deepEqual(parseInteractiveOptions(source), [{ kind: 'markdown', content: source }]);
});

test('normalizes parenthesized LaTeX delimiters', () => {
  assert.equal(normalizeMathDelimiters(String.raw`\(f(x)=\frac{1}{x}\) and \[x^2\]`), '$f(x)=\\frac{1}{x}$ and $$\nx^2\n$$');
});
