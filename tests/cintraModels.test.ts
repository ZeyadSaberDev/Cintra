import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CINTRA_IDENTITY_POLICY,
  CINTRA_MODELS,
  createDefaultCintraModelRoutes,
  isCintraModelId,
  resolveCintraFusionModel,
  resolveCintraModelId,
  resolveCintraRouteCandidates,
} from '../lib/ai/cintraModels.js';

test('publishes only the four Cintra capabilities', () => {
  assert.deepEqual(CINTRA_MODELS.map(({ id }) => id), [
    'cintra-core-v1',
    'cintra-research',
    'cintra-creative',
    'cintra-analyst',
  ]);
  assert.ok(CINTRA_MODELS.every(({ name }) => name.includes('Cintra')));
});

test('accepts public Cintra ids and routes capabilities to configured models', () => {
  const availableModels = [
    { id: 'core-route', name: 'General chat' },
    { id: 'research-route', name: 'Web Search' },
    { id: 'vision-route', name: 'Multimodal Vision' },
    { id: 'pdf-route', name: 'Document Analysis' },
  ];

  assert.equal(isCintraModelId('cintra-research'), true);
  assert.equal(isCintraModelId('gpt-5'), false);
  assert.equal(resolveCintraModelId('cintra-core-v1', availableModels, 'core-route'), 'core-route');
  assert.equal(resolveCintraModelId('cintra-research', availableModels, 'core-route'), 'research-route');
  assert.equal(resolveCintraModelId('cintra-creative', availableModels, 'core-route'), 'vision-route');
  assert.equal(resolveCintraModelId('cintra-analyst', availableModels, 'core-route'), 'pdf-route');
  assert.equal(resolveCintraModelId('cintra-research', [], 'core-route'), 'core-route');
});

test('creates separate capability routes and preserves the existing Core default', () => {
  const routes = createDefaultCintraModelRoutes([
    { id: 'core-a', name: 'Chat', apiId: 'api-a', isEnabled: true },
    { id: 'search-a', name: 'Web Search', apiId: 'api-a', isEnabled: true },
    { id: 'image-a', name: 'Image Generation', apiId: 'api-a', isEnabled: true },
    { id: 'pdf-a', name: 'PDF Analyst', apiId: 'api-a', isEnabled: true },
    { id: 'core-b', name: 'Chat fallback', apiId: 'api-b', isEnabled: true },
    { id: 'search-off', name: 'Web Search', apiId: 'api-b', isEnabled: false },
  ], ['core-a', 'core-b']);

  assert.deepEqual(routes, {
    'cintra-core-v1': ['core-a', 'core-b'],
    'cintra-research': ['search-a', 'core-b'],
    'cintra-creative': ['image-a', 'core-b'],
    'cintra-analyst': ['pdf-a', 'core-b'],
  });
  assert.deepEqual(
    createDefaultCintraModelRoutes(
      [{ id: 'disabled-core', name: 'Chat', apiId: 'api-a', isEnabled: true }],
      [],
    ),
    {
      'cintra-core-v1': [],
      'cintra-research': [],
      'cintra-creative': [],
      'cintra-analyst': [],
    },
  );
});

test('resolves each public capability to its own active routes in API priority order', () => {
  const routes: ReturnType<typeof createDefaultCintraModelRoutes> = {
    'cintra-core-v1': ['core-a'],
    'cintra-research': ['research-b', 'research-a', 'disabled-route'],
    'cintra-creative': ['image-a'],
    'cintra-analyst': ['pdf-a'],
  };
  const models = [
    { id: 'core-a', apiId: 'api-a', isEnabled: true },
    { id: 'research-a', apiId: 'api-a', isEnabled: true },
    { id: 'research-b', apiId: 'api-b', isEnabled: true },
    { id: 'disabled-route', apiId: 'api-c', isEnabled: false },
    { id: 'image-a', apiId: 'api-a', isEnabled: true },
    { id: 'pdf-a', apiId: 'api-a', isEnabled: true },
  ];
  const providers = [
    { id: 'api-a', apiKey: 'key-a', isActive: true, priority: 2 },
    { id: 'api-b', apiKey: 'key-b', isActive: true, priority: 1 },
    { id: 'api-c', apiKey: 'key-c', isActive: false, priority: 0 },
  ];

  assert.deepEqual(
    resolveCintraRouteCandidates('cintra-research', routes, models, providers).map(({ route }) => route.id),
    ['research-b', 'research-a'],
  );
  assert.deepEqual(
    resolveCintraRouteCandidates('cintra-creative', routes, models, providers).map(({ route }) => route.id),
    ['image-a'],
  );
});

test('supports provider-managed Auto routes per API connection', () => {
  const routes: ReturnType<typeof createDefaultCintraModelRoutes> = {
    'cintra-core-v1': ['auto:api-b'],
    'cintra-research': [],
    'cintra-creative': [],
    'cintra-analyst': [],
  };
  const providers = [
    { id: 'api-a', apiKey: 'key-a', isActive: true, priority: 1 },
    { id: 'api-b', apiKey: 'key-b', isActive: true, priority: 2 },
    { id: 'api-c', apiKey: 'key-c', isActive: false, priority: 0 },
  ];
  const candidates = resolveCintraRouteCandidates('cintra-core-v1', routes, [], providers);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].provider.id, 'api-b');
  assert.equal(candidates[0].route.apiModelId, 'auto');
  assert.equal(candidates[0].route.name, 'Auto');
  assert.deepEqual(
    resolveCintraRouteCandidates('cintra-core-v1', {
      ...routes,
      'cintra-core-v1': ['auto:api-c'],
    }, [], providers),
    [],
  );
});

test('uses the requested Cintra identity policy text', () => {
  assert.match(CINTRA_IDENTITY_POLICY, /اسمك Cintra، وأنت مساعد ذكاء اصطناعي متقدم بصيغة المذكر/);
  assert.match(CINTRA_IDENTITY_POLICY, /من تطوير المهندس زياد صابر/);
  assert.match(CINTRA_IDENTITY_POLICY, /لا تدّعِ أنك نموذج أو مساعد تابع لشركة أخرى/);
  assert.match(CINTRA_IDENTITY_POLICY, /لا تكشف اسم النموذج أو المزوّد/);
  assert.match(CINTRA_IDENTITY_POLICY, /لا ترفض ذكر شركة لمجرد أنها جهة أخرى/);
  assert.match(CINTRA_IDENTITY_POLICY, /Your name is Cintra/);
  assert.match(CINTRA_IDENTITY_POLICY, /Eng\. Ziad Saber/);
  assert.match(CINTRA_IDENTITY_POLICY, /answer factual and neutral questions normally/);
  assert.match(CINTRA_IDENTITY_POLICY, /Never claim that you are another company's model/);
});

test('routes Cintra Core to the provider Fusion auto model by default', () => {
  assert.equal(resolveCintraFusionModel('cintra-core-v1', 'auto'), 'auto');
  assert.equal(resolveCintraFusionModel('cintra-research', 'auto'), null);
  assert.equal(resolveCintraFusionModel('cintra-core-v1', 'admin-selected-model'), null);
});
