import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildImageGenerationPayload,
  extractGeneratedImage,
  extractImageProviderError,
  generateInlineImage,
  getImageGenerationsUrl,
  getImageSize,
  imageProviderError,
} from '../lib/ai/imageGeneration.js';

test('normalizes image API base URLs and preserves an explicit image endpoint', () => {
  assert.equal(getImageGenerationsUrl('https://api.example/v1'), 'https://api.example/v1/images/generations');
  assert.equal(getImageGenerationsUrl('https://api.example/v1/chat/completions'), 'https://api.example/v1/images/generations');
  assert.equal(getImageGenerationsUrl('https://api.example/custom/images'), 'https://api.example/custom/images/generations');
  assert.equal(getImageGenerationsUrl('https://api.example/custom/images/generations'), 'https://api.example/custom/images/generations');
});

test('requests a real inline image from the configured generator and verifies its image bytes', async () => {
  const originalFetch = globalThis.fetch;
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    request = { url: String(input), init };
    return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
      headers: { 'content-type': 'image/png' },
    });
  }) as typeof fetch;

  try {
    const result = await generateInlineImage({
      configuredUrl: 'https://images.example/v1',
      apiKey: 'server-only-test-key',
      model: 'cf/black-forest-labs/flux-1-schnell',
      prompt: 'A clear diagram of a desktop backup workflow',
      signal: new AbortController().signal,
    });

    assert.equal(request?.url, 'https://images.example/v1/images/generations');
    assert.equal(new Headers(request?.init?.headers).get('authorization'), 'Bearer server-only-test-key');
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      model: 'cf/black-forest-labs/flux-1-schnell',
      prompt: 'A clear diagram of a desktop backup workflow',
    });
    assert.equal(result.mimeType, 'image/png');
    assert.equal(result.bytes.length, 8);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses DALL-E 3-supported dimensions and keeps compatible sizes for other models', () => {
  assert.equal(getImageSize('dall-e-3', '1:1'), '1024x1024');
  assert.equal(getImageSize('dall-e-3', '16:9'), '1792x1024');
  assert.equal(getImageSize('dall-e-3', '9:16'), '1024x1792');
  assert.equal(getImageSize('gpt-image-1', '16:9'), '1536x1024');
  assert.equal(getImageSize('gpt-image-1', '9:16'), '1024x1536');
});

test('sends the documented minimal request shape to Cloudflare image models', () => {
  assert.deepEqual(
    buildImageGenerationPayload('@cf/black-forest-labs/flux-2-klein-4b', 'a red cat', '16:9'),
    { model: '@cf/black-forest-labs/flux-2-klein-4b', prompt: 'a red cat' },
  );
  assert.deepEqual(
    buildImageGenerationPayload('cf/black-forest-labs/flux-1-schnell', 'a red cat', '16:9'),
    { model: 'cf/black-forest-labs/flux-1-schnell', prompt: 'a red cat' },
  );
  assert.deepEqual(buildImageGenerationPayload('dall-e-3', 'a red cat', '16:9'), {
    model: 'dall-e-3',
    prompt: 'a red cat',
    n: 1,
    size: '1792x1024',
  });
});

test('extracts OpenAI-compatible and Cloudflare-style generated image responses', () => {
  assert.deepEqual(extractGeneratedImage({ data: [{ b64_json: 'cG5n' }] }), { base64: 'cG5n' });
  assert.deepEqual(extractGeneratedImage({ result: { image: 'cG5n' } }), { base64: 'cG5n' });
  assert.deepEqual(extractGeneratedImage({ image: 'data:image/png;base64,cG5n' }), { base64: 'cG5n' });
  assert.deepEqual(extractGeneratedImage({ data: [{ url: 'https://images.example/image.png' }] }), {
    url: 'https://images.example/image.png',
  });
  assert.equal(extractGeneratedImage({ success: false }), null);
});

test('extracts bounded provider errors without forwarding bearer credentials', () => {
  assert.equal(
    extractImageProviderError({ error: { message: 'Bearer secret-token was rejected' } }),
    'Bearer [redacted] was rejected',
  );
  assert.equal(extractImageProviderError({ detail: 'invalid image model' }), 'invalid image model');
  assert.equal(extractImageProviderError('<html><body>image upstream timeout</body></html>'), 'image upstream timeout');
  assert.equal(extractImageProviderError('Bearer secret-token was rejected'), 'Bearer [redacted] was rejected');
});

test('explains image model, endpoint, and API permission failures', () => {
  assert.equal(imageProviderError(400).code, 'IMAGE_MODEL_REJECTED');
  assert.equal(imageProviderError(401).code, 'IMAGE_PROVIDER_AUTH_ERROR');
  assert.equal(imageProviderError(404).code, 'IMAGE_PROVIDER_UNAVAILABLE');
  assert.equal(imageProviderError(429).code, 'IMAGE_RATE_LIMITED');
  assert.equal(imageProviderError(500).code, 'IMAGE_PROVIDER_ERROR');
});
