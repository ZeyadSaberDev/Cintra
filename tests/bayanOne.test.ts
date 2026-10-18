import assert from 'node:assert/strict';
import test from 'node:test';
import { autoLinkBayanOneModelIds, resolveBayanOneRoutes, shouldFallbackBayanOne } from '../lib/ai/bayanOne.js';

test('Bayan One provider chain honors API priority and admin-linked routes', () => {
  const routes = resolveBayanOneRoutes(
    { active: true, modelIds: ['model-b', 'model-a', 'not-linked'], autoLinkNewApis: false },
    [
      { id: 'api-b', apiKey: 'key', baseUrl: 'https://b.example/v1', isActive: true, priority: 2 },
      { id: 'api-a', apiKey: 'key', baseUrl: 'https://a.example/v1', isActive: true, priority: 1 },
      { id: 'api-disabled', apiKey: 'key', baseUrl: 'https://disabled.example/v1', isActive: false, priority: 0 },
    ],
    [
      { id: 'model-a', apiId: 'api-a', apiModelId: 'upstream-a', isEnabled: true },
      { id: 'model-b', apiId: 'api-b', apiModelId: 'upstream-b', isEnabled: true },
      { id: 'not-linked', apiId: 'api-disabled', apiModelId: 'upstream-x', isEnabled: true },
    ],
  );
  assert.deepEqual(routes.map(({ route }) => route.id), ['model-a', 'model-b']);
  const reprioritizedRoutes = resolveBayanOneRoutes(
    { active: true, modelIds: ['model-b', 'model-a'], autoLinkNewApis: false },
    [
      { id: 'api-b', apiKey: 'key', baseUrl: 'https://b.example/v1', isActive: true, priority: 1 },
      { id: 'api-a', apiKey: 'key', baseUrl: 'https://a.example/v1', isActive: true, priority: 2 },
    ],
    [
      { id: 'model-a', apiId: 'api-a', apiModelId: 'upstream-a', isEnabled: true },
      { id: 'model-b', apiId: 'api-b', apiModelId: 'upstream-b', isEnabled: true },
    ],
  );
  assert.deepEqual(reprioritizedRoutes.map(({ route }) => route.id), ['model-b', 'model-a']);
});

test('Bayan One requires an active platform configuration and usable API key', () => {
  const models = [{ id: 'route', apiId: 'api', apiModelId: 'upstream', isEnabled: true }];
  assert.equal(resolveBayanOneRoutes(
    { active: false, modelIds: ['route'], autoLinkNewApis: false },
    [{ id: 'api', apiKey: 'key', baseUrl: 'https://api.example/v1', isActive: true, priority: 1 }],
    models,
  ).length, 0);
  assert.equal(resolveBayanOneRoutes(
    { active: true, modelIds: ['route'], autoLinkNewApis: false },
    [{ id: 'api', apiKey: '', baseUrl: 'https://api.example/v1', isActive: true, priority: 1 }],
    models,
  ).length, 0);
});

test('Bayan One only falls back for retryable provider availability failures', () => {
  for (const code of ['HTTP_500', 'HTTP_503', 'PROVIDER_RATE_LIMIT', 'PROVIDER_QUOTA_EXCEEDED', 'MODEL_NOT_FOUND', 'NETWORK_ERROR']) {
    assert.equal(shouldFallbackBayanOne(code), true, `${code} should try the next linked provider`);
  }
  for (const code of ['INVALID_API_KEY', 'PROVIDER_ACCESS_DENIED', 'HTTP_400']) {
    assert.equal(shouldFallbackBayanOne(code), false, `${code} should be surfaced without provider failover`);
  }
});

test('new APIs are auto-linked only when the administrator enables the setting', () => {
  const config = { active: true, modelIds: ['existing-model'], autoLinkNewApis: true };
  assert.deepEqual(autoLinkBayanOneModelIds(
    config,
    [{ id: 'existing-model', apiId: 'existing-api' }],
    [
      { id: 'new-model-a', apiId: 'new-api-a', isEnabled: true },
      { id: 'new-model-b', apiId: 'new-api-a', isEnabled: true },
      { id: 'disabled-model', apiId: 'new-api-b', isEnabled: false },
    ],
    new Set(['existing-api', 'new-api-a', 'new-api-b']),
  ), ['existing-model', 'new-model-a']);
  assert.deepEqual(autoLinkBayanOneModelIds(
    { ...config, autoLinkNewApis: false },
    [],
    [{ id: 'new-model', apiId: 'new-api', isEnabled: true }],
    new Set(['new-api']),
  ), config.modelIds);
});
