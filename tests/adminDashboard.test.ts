import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterModelsByApi, reorderApiIds } from '../src/components/admin/apiPriority.js';
import { translateAdminText } from '../src/components/admin/adminI18n.js';

test('API priority reordering makes priority one the primary connection', () => {
  const apis = [
    { id: 'codecraft', priority: 1 },
    { id: 'cleanapis', priority: 2 },
    { id: 'backup', priority: 3 },
  ];
  assert.deepEqual(reorderApiIds(apis, 'backup', 1), ['backup', 'codecraft', 'cleanapis']);
  assert.deepEqual(reorderApiIds(apis, 'codecraft', 3), ['cleanapis', 'backup', 'codecraft']);
});

test('priority reorder preserves all API connections and clamps to valid positions', () => {
  const apis = [{ id: 'a', priority: 1 }, { id: 'b', priority: 1 }, { id: 'c', priority: 3 }];
  assert.deepEqual(reorderApiIds(apis, 'a', 100), ['b', 'c', 'a']);
  assert.deepEqual(reorderApiIds(apis, 'missing', 2), ['a', 'b', 'c']);
});

test('model filtering shows only models belonging to the selected API', () => {
  const models = [
    { id: 'cc-model', apiId: 'codecraft' },
    { id: 'ca-model', apiId: 'cleanapis' },
  ];
  assert.deepEqual(filterModelsByApi(models, 'codecraft'), [models[0]]);
  assert.deepEqual(filterModelsByApi(models, 'cleanapis'), [models[1]]);
  assert.deepEqual(filterModelsByApi(models, ''), models);
});

test('dashboard translations switch text by language and preserve dynamic values', () => {
  assert.equal(translateAdminText('API management', 'ar'), 'إدارة واجهات API');
  assert.equal(translateAdminText('Service API routing', 'ar'), 'توجيه واجهات الخدمات');
  assert.equal(translateAdminText('API management', 'en'), 'API management');
  assert.equal(translateAdminText('4 selected', 'ar'), '4 محدد');
  assert.equal(translateAdminText('CodeCraft API', 'ar'), 'CodeCraft API');
  assert.equal(
    translateAdminText('Remove API connection "CodeCraft"? Model definitions and usage records will be kept.', 'ar'),
    'هل تريد إزالة اتصال API "CodeCraft"؟ سيتم الاحتفاظ بتعريفات النماذج وسجلات الاستخدام.',
  );
  assert.equal(
    translateAdminText('This is the primary API. Deleting "CleanAPIs" will promote the next active API. Model definitions and usage records will be kept.', 'ar'),
    'هذا هو اتصال API الأساسي. عند حذف "CleanAPIs" سيصبح اتصال API النشط التالي هو الأساسي. سيتم الاحتفاظ بتعريفات النماذج وسجلات الاستخدام.',
  );
});
