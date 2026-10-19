import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCleanApisConfig,
  getRuntimeImageProvider,
  getRuntimeSearchProvider,
  getRuntimeServiceProvider,
  getPublicModelCatalog,
  imageContentPart,
  isPublicModelId,
  setRuntimeProviderRouting,
  setRuntimeServiceApiRoutes,
} from '../lib/ai/provider.js';

test('encodes image bytes as an OpenAI-compatible multimodal data URL', () => {
  assert.deepEqual(imageContentPart('image/png', Buffer.from('image-bytes')), {
    type: 'image_url',
    image_url: { url: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=' },
  });
  assert.throws(() => imageContentPart('text/plain', Buffer.from('not an image')), /Unsupported image MIME type/);
  assert.throws(() => imageContentPart('image/png', Buffer.alloc(0)), /empty file/);
});

test('publishes enabled custom models under Cintra labels without exposing provider model IDs', () => {
  setRuntimeProviderRouting([
    { id: 'active-api', apiKey: 'active-key', baseUrl: 'https://active.example/v1', isActive: true, priority: 1 },
    { id: 'inactive-api', apiKey: 'inactive-key', baseUrl: 'https://inactive.example/v1', isActive: false, priority: 2 },
  ], [
    {
      id: 'active-api:provider-model', name: 'Raw provider model', publicId: 'cintra-custom-public-alias',
      publicName: 'Cintra Studio', isPublic: true, apiId: 'active-api', apiModelId: 'private-upstream-id',
      provider: 'some-provider', isEnabled: true, costTier: 'medium',
    },
    {
      id: 'inactive-api:hidden-model', name: 'Hidden model', publicId: 'cintra-custom-hidden',
      publicName: 'Cintra Hidden', isPublic: true, apiId: 'inactive-api', apiModelId: 'hidden-upstream-id',
      provider: 'some-provider', isEnabled: true,
    },
  ]);

  const catalog = getPublicModelCatalog();
  const customModel = catalog.find((model) => model.id === 'cintra-custom-public-alias');
  assert.equal(customModel?.name, 'Cintra Studio');
  assert.equal(customModel?.provider, 'Cintra');
  assert.equal(catalog.some((model) => model.id.includes('provider-model') || model.name.includes('Raw provider')), false);
  assert.equal(catalog.some((model) => model.id === 'cintra-custom-hidden'), false);
  assert.equal(isPublicModelId('cintra-custom-public-alias'), true);
  assert.equal(isPublicModelId('cintra-custom-hidden'), false);
  setRuntimeProviderRouting([], []);
});

test('selects the highest-priority active runtime API for image generation', () => {
  setRuntimeProviderRouting([
    { id: 'secondary', apiKey: 'secondary-key', baseUrl: 'https://secondary.example/v1', isActive: true, priority: 2 },
    { id: 'inactive', apiKey: 'inactive-key', baseUrl: 'https://inactive.example/v1', isActive: false, priority: 0 },
    { id: 'primary', apiKey: 'primary-key', baseUrl: 'https://primary.example/v1', isActive: true, priority: 1 },
  ], []);

  assert.deepEqual(getRuntimeImageProvider(), {
    apiKey: 'primary-key',
    baseUrl: 'https://primary.example/v1',
  });
});

test('does not select inactive or keyless runtime APIs for image generation', () => {
  setRuntimeProviderRouting([
    { id: 'inactive', apiKey: 'inactive-key', baseUrl: 'https://inactive.example/v1', isActive: false, priority: 1 },
    { id: 'keyless', apiKey: '  ', baseUrl: 'https://keyless.example/v1', isActive: true, priority: 2 },
  ], []);

  assert.equal(getRuntimeImageProvider(), null);
});

test('selects the highest-priority active runtime API for web search', () => {
  setRuntimeProviderRouting([
    { id: 'secondary', apiKey: 'secondary-key', baseUrl: 'https://secondary.example/v1', isActive: true, priority: 2 },
    { id: 'inactive', apiKey: 'inactive-key', baseUrl: 'https://inactive.example/v1', isActive: false, priority: 0 },
    { id: 'primary', apiKey: 'primary-key', baseUrl: 'https://primary.example/v1', isActive: true, priority: 1 },
  ], []);

  assert.deepEqual(getRuntimeSearchProvider(), {
    apiKey: 'primary-key',
    baseUrl: 'https://primary.example/v1',
    providerId: 'primary',
  });
});

test('routes service endpoints to their selected API and keeps priority fallback when unassigned', () => {
  setRuntimeProviderRouting([
    { id: 'image-api', apiKey: 'image-key', baseUrl: 'https://images.example/v1', isActive: true, priority: 2 },
    { id: 'primary', apiKey: 'primary-key', baseUrl: 'https://primary.example/v1', isActive: true, priority: 1 },
    { id: 'inactive-search', apiKey: 'inactive-key', baseUrl: 'https://inactive.example/v1', isActive: false, priority: 0 },
  ], []);
  setRuntimeServiceApiRoutes({
    image: 'image-api',
    search: null,
    speech: null,
    transcription: null,
    embeddings: null,
  });

  assert.equal(getRuntimeServiceProvider('image')?.providerId, 'image-api');
  assert.equal(getRuntimeServiceProvider('search')?.providerId, 'primary');
  assert.equal(getRuntimeImageProvider()?.baseUrl, 'https://images.example/v1');

  setRuntimeServiceApiRoutes({
    image: 'image-api',
    search: 'inactive-search',
    speech: null,
    transcription: null,
    embeddings: null,
  });
  assert.equal(getRuntimeServiceProvider('search'), null);
  setRuntimeServiceApiRoutes({
    image: null,
    search: null,
    speech: null,
    transcription: null,
    embeddings: null,
  });
});

test('uses the Fusion auto model when no provider model is configured', () => {
  const original = process.env.FREELLMAPI_DEFAULT_MODEL;
  delete process.env.FREELLMAPI_DEFAULT_MODEL;
  try {
    assert.equal(getCleanApisConfig().defaultModel, 'auto');
  } finally {
    if (original === undefined) delete process.env.FREELLMAPI_DEFAULT_MODEL;
    else process.env.FREELLMAPI_DEFAULT_MODEL = original;
  }
});
