import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createIdentityAwareStreamFilter,
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

  assert.equal(filtered, 'Cintra المطوّر بواسطة المهندس زياد صابر. OpenAI was founded in 2015.');
  assert.equal(
    replaceFalseIdentityClaims('As a language model created by Google, I can explain its history.'),
    'Cintra المطوّر بواسطة المهندس زياد صابر, I can explain its history.',
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

  assert.equal(output, 'Cintra المطوّر بواسطة المهندس زياد صابر. OpenAI was founded in 2015.');
});

test('filters Arabic self-attribution split across stream chunks', () => {
  const filter = createIdentityAwareStreamFilter();
  let output = '';

  output += filter.push('أنا نموذج تم تطويري بواسطة ');
  assert.equal(output, '');
  output += filter.push('Google.');
  output += filter.finish();

  assert.equal(output, 'Cintra المطوّر بواسطة المهندس زياد صابر.');
});
