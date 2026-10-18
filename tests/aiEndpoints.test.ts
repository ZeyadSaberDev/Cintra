import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAudioSpeechUrl,
  getAudioTranscriptionsUrl,
  getChatCompletionsUrl,
  getEmbeddingsUrl,
  getModelsUrl,
  getWebSearchUrl,
} from '../lib/ai/endpoints.js';

test('builds CodeCraft-compatible endpoints from a versioned base URL', () => {
  const baseUrl = 'https://codecraftapi.com/v1';
  assert.equal(getChatCompletionsUrl(baseUrl), 'https://codecraftapi.com/v1/chat/completions');
  assert.equal(getModelsUrl(baseUrl), 'https://codecraftapi.com/v1/models');
});

test('builds FreeLLMAPI endpoints from its configured base URL', () => {
  const baseUrl = 'https://freellmapi-zeyad.up.railway.app/v1';
  assert.equal(getChatCompletionsUrl(baseUrl), 'https://freellmapi-zeyad.up.railway.app/v1/chat/completions');
  assert.equal(getModelsUrl(baseUrl), 'https://freellmapi-zeyad.up.railway.app/v1/models');
  assert.equal(getWebSearchUrl(baseUrl), 'https://freellmapi-zeyad.up.railway.app/v1/search');
  assert.equal(getAudioSpeechUrl(baseUrl), 'https://freellmapi-zeyad.up.railway.app/v1/audio/speech');
  assert.equal(getAudioTranscriptionsUrl(baseUrl), 'https://freellmapi-zeyad.up.railway.app/v1/audio/transcriptions');
  assert.equal(getEmbeddingsUrl(baseUrl), 'https://freellmapi-zeyad.up.railway.app/v1/embeddings');
});

test('builds endpoints from CleanAPIs chat-completions URL without duplicating paths', () => {
  const baseUrl = 'https://cleanapis.com/v1/chat/completions';
  assert.equal(getChatCompletionsUrl(baseUrl), baseUrl);
  assert.equal(getModelsUrl(baseUrl), 'https://cleanapis.com/v1/models');
  assert.equal(getWebSearchUrl(baseUrl), 'https://cleanapis.com/v1/search');
  assert.equal(getAudioSpeechUrl(baseUrl), 'https://cleanapis.com/v1/audio/speech');
  assert.equal(getAudioTranscriptionsUrl(baseUrl), 'https://cleanapis.com/v1/audio/transcriptions');
  assert.equal(getEmbeddingsUrl(baseUrl), 'https://cleanapis.com/v1/embeddings');
});

test('normalizes model-list URLs and trailing slashes', () => {
  assert.equal(
    getChatCompletionsUrl('https://api.example.com/v1/models/'),
    'https://api.example.com/v1/chat/completions',
  );
  assert.equal(getModelsUrl('https://api.example.com/v1/models/'), 'https://api.example.com/v1/models');
  assert.equal(getWebSearchUrl('https://api.example.com/v1/search/'), 'https://api.example.com/v1/search');
});

test('builds media endpoints when configured with a chat endpoint URL', () => {
  const baseUrl = 'https://api.example.com/v1/chat/completions';
  assert.equal(getAudioSpeechUrl(baseUrl), 'https://api.example.com/v1/audio/speech');
  assert.equal(getAudioTranscriptionsUrl(baseUrl), 'https://api.example.com/v1/audio/transcriptions');
  assert.equal(getEmbeddingsUrl(baseUrl), 'https://api.example.com/v1/embeddings');
});
