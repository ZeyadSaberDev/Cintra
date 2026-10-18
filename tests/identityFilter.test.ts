import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createIdentityAwareStreamFilter,
  filterIdentityResponse,
  IDENTITY_RESPONSE,
  isIdentityOnlyQuestion,
  replaceFalseIdentityClaims,
} from '../lib/ai/identityFilter.js';

test('recognizes direct identity questions without intercepting general questions', () => {
  for (const question of [
    'من أنت؟',
    'مين عملك',
    'مين المطور؟',
    'اسمك ايه؟',
    'مين مطورك؟',
    'What is your model?',
    'Who created you?',
  ]) {
    assert.equal(isIdentityOnlyQuestion(question), true, question);
  }

  for (const question of [
    'من طور شركة Anthropic؟',
    'What is OpenAI known for?',
    'Which model is best for coding?',
  ]) {
    assert.equal(isIdentityOnlyQuestion(question), false, question);
  }

  assert.match(IDENTITY_RESPONSE, /Cintra/);
});

test('replaces false self-attribution and preserves ordinary company mentions', () => {
  const response = 'I am a model trained by Anthropic. OpenAI was founded in 2015.';
  const filtered = replaceFalseIdentityClaims(response);

  assert.equal(
    filtered,
    'I am Cintra, your professional AI assistant, developed by Eng. Ziad Saber. OpenAI was founded in 2015.',
  );
  assert.equal(
    replaceFalseIdentityClaims('As a language model created by Google, I can explain its history.'),
    'As Cintra, an AI platform developed by Eng. Ziad Saber.',
  );
  assert.equal(
    replaceFalseIdentityClaims('أنا Gemma 2 2B من تطوير Google. تأسست OpenAI عام 2015.'),
    'أنا Cintra، تم تطويري بواسطة المهندس زياد صابر. تأسست OpenAI عام 2015.',
  );
  assert.equal(
    replaceFalseIdentityClaims('I am Gemma 2 2B from Google.'),
    'I am Cintra, your professional AI assistant, developed by Eng. Ziad Saber.',
  );
  assert.equal(
    replaceFalseIdentityClaims('بصفتي ذكاء اصطناعي من قِبل ChatGPT أستطيع مساعدتك.'),
    'بصفتي منصة Cintra الذكية المطورة بواسطة المهندس زياد صابر.',
  );
  assert.equal(
    replaceFalseIdentityClaims('I am a model trained by OpenAI.'),
    'I am Cintra, your professional AI assistant, developed by Eng. Ziad Saber.',
  );
  assert.equal(
    replaceFalseIdentityClaims('تأسست شركة OpenAI عام 2015، وAnthropic شركة أخرى.'),
    'تأسست شركة OpenAI عام 2015، وAnthropic شركة أخرى.',
  );
});

test('filters false identity claims split across stream chunks', () => {
  const filter = createIdentityAwareStreamFilter();
  let output = '';

  output += filter.push('I am a model trained by ');
  assert.equal(output, '');
  output += filter.push('Anthropic. OpenAI was founded in 2015.');
  output += filter.finish();

  assert.equal(output, 'I am Cintra, your professional AI assistant, developed by Eng. Ziad Saber. OpenAI was founded in 2015.');
});

test('filters Arabic self-attribution split across stream chunks', () => {
  const filter = createIdentityAwareStreamFilter();
  let output = '';

  output += filter.push('أنا Gemma 2 2B من تطوير ');
  assert.equal(output, '');
  output += filter.push('Google.');
  output += filter.finish();

  assert.equal(output, 'أنا Cintra، تم تطويري بواسطة المهندس زياد صابر.');
});

test('filters Arabic identity-institution attributions across streamed chunks', () => {
  const filter = createIdentityAwareStreamFilter();
  let output = '';

  output += filter.push('بصفتي ذكاء اصطناعي من قِبل ');
  assert.equal(output, '');
  output += filter.push('ChatGPT أستطيع مساعدتك.');
  output += filter.finish();

  assert.equal(output, 'بصفتي منصة Cintra الذكية المطورة بواسطة المهندس زياد صابر.');
});

test('keeps ordinary company discussion in streamed replies unchanged', () => {
  const filter = createIdentityAwareStreamFilter();
  const response = 'OpenAI and Google announced new products.';

  assert.equal(filter.push(response), response);
  assert.equal(filter.finish(), '');
});

test('does not suppress unrelated first-person statements', () => {
  assert.equal(
    replaceFalseIdentityClaims('I am discussing Google and OpenAI in this answer.'),
    'I am discussing Google and OpenAI in this answer.',
  );
});

test('filters JSON response strings recursively while preserving ordinary company mentions', () => {
  assert.deepEqual(
    filterIdentityResponse({
      content: 'I am a model trained by Google.',
      nested: ['OpenAI published an update.', 'أنا نموذج من تطوير Anthropic.'],
      count: 2,
    }),
    {
      content: 'I am Cintra, your professional AI assistant, developed by Eng. Ziad Saber.',
      nested: ['OpenAI published an update.', 'أنا Cintra، تم تطويري بواسطة المهندس زياد صابر.'],
      count: 2,
    },
  );
});
