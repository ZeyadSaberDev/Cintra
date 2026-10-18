import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatWebSearchContext, searchWeb, shouldSearchWeb, shouldSearchWebWithConsent } from '../lib/web/webSearch.js';

test('searches only on explicit web requests or when Cintra Research is selected', () => {
  assert.equal(shouldSearchWeb('Search the web for the latest version of Node.js'), true);
  assert.equal(shouldSearchWeb('Check online for the weather in Cairo'), true);
  assert.equal(shouldSearchWeb('ابحث لي عن آخر أخبار الذكاء الاصطناعي'), true);
  assert.equal(shouldSearchWeb('شوف لي في المواقع سعر الدولار'), true);
  assert.equal(shouldSearchWeb('دور في النت على مواعيد المتحف'), true);
  assert.equal(shouldSearchWeb('What are the latest news today?'), true);
  assert.equal(shouldSearchWeb('What is the latest version of Node.js?'), false);
  assert.equal(shouldSearchWeb('Find the weather in Cairo today'), false);
  assert.equal(shouldSearchWeb('ما سعر الدولار اليوم؟'), false);
  assert.equal(shouldSearchWeb('ما عاصمة فرنسا؟'), false);
  assert.equal(shouldSearchWeb('Explain recursion with an example'), false);
  assert.equal(shouldSearchWeb('أي سؤال عادي', 'cintra-research'), true);
});

test('requires explicit user consent before a search request is made', () => {
  assert.equal(shouldSearchWebWithConsent('Search the web for this topic', 'cintra-core-v1', false), false);
  assert.equal(shouldSearchWebWithConsent('What is new?', 'cintra-research', false), false);
  assert.equal(shouldSearchWebWithConsent('Search the web for this topic', 'cintra-core-v1', true), true);
  assert.equal(shouldSearchWebWithConsent('What is new?', 'cintra-research', true), true);
  assert.equal(shouldSearchWebWithConsent('Explain photosynthesis', 'cintra-core-v1', true), false);
});

test('sends authenticated FreeLLMAPI search requests and validates source URLs', async () => {
  const originalFetch = globalThis.fetch;
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({
      answer: 'Fresh search summary',
      results: [
        { title: 'A useful source', url: 'https://example.com/article', content: 'Relevant facts' },
        { title: 'Invalid source', url: 'javascript:alert(1)', content: 'Discard this' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await searchWeb(
      'latest technology news',
      { apiKey: 'server-only-test-key', baseUrl: 'https://freellmapi-zeyad.up.railway.app/v1' },
    );
    assert.equal(request?.url, 'https://freellmapi-zeyad.up.railway.app/v1/search');
    assert.equal(new Headers(request?.init?.headers).get('authorization'), 'Bearer server-only-test-key');
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      query: 'latest technology news',
      max_results: 5,
    });
    assert.equal(result.answer, 'Fresh search summary');
    assert.equal(result.results.length, 1);
    assert.match(formatWebSearchContext(result), /https:\/\/example\.com\/article/);
    assert.match(formatWebSearchContext(result), /untrusted data/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
