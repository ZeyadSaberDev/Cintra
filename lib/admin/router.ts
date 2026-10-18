import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import {
  createEmailPasswordAccount,
  createPasswordFingerprint,
  matchesPasswordFingerprint,
  signOutSession,
  updateLocalAccountCredentials,
} from '../auth/local.js';
import { getCleanApisConfig, setRuntimeApiOverride, setRuntimeBayanOneConfig, setRuntimeCintraModelRoutes, setRuntimeEnabledModels, setRuntimeProviderRouting, setRuntimeServiceApiRoutes } from '../ai/provider.js';
import { getChatCompletionsUrl, getModelsUrl } from '../ai/endpoints.js';
import { DEFAULT_SERVICE_API_ROUTES, SERVICE_API_CAPABILITIES, type ServiceApiRoutes } from '../ai/serviceApiRoutes.js';
import { autoLinkBayanOneModelIds, BAYAN_ONE_MODEL_ID, BAYAN_ONE_MODEL_NAME, type BayanOneConfig } from '../ai/bayanOne.js';
import { AUTO_CINTRA_ROUTE_PREFIX, CINTRA_IDENTITY_POLICY, CINTRA_MODELS, createDefaultCintraModelRoutes, type CintraModelRoutes } from '../ai/cintraModels.js';
import { LocalRepository, type DataFilter, type DataListOptions } from '../db/repository.js';
import type { DataCollection } from '../db/collections.js';
import { usageRepo, userRepo } from '../db/index.js';
import { deleteLocalFile, downloadLocalFile, localStorageUsageBytes } from '../storage/local.js';
import { setRuntimeAdminAccessKey, verifyAdminAccessKey } from './security.js';
import { decryptAdminSecret, encryptAdminSecret, maskAdminSecret } from './secrets.js';
import { addAdminEmail, isAdminEmailAllowed, listAdminEmails, removeAdminEmail } from './allowlist.js';
import { cachedAdminSetting, invalidateAdminSetting } from './settingsCache.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import {
  deleteLocalUser,
  disableLocalUser,
  findLocalUserByEmail,
  findLocalUserForProfile,
  grantAdminRole,
  revokeAdminRole,
} from './claims.js';

export const adminRouter = Router();

type Row = { id: string; [key: string]: any };
const repositories = new Map<DataCollection, LocalRepository<Row>>();
let adminStatsCache: { expiresAt: number; data: Record<string, unknown> } | null = null;

function repository(collection: DataCollection): LocalRepository<Row> {
  let repo = repositories.get(collection);
  if (!repo) {
    repo = new LocalRepository<Row>(collection);
    repositories.set(collection, repo);
  }
  return repo;
}

async function all(collection: DataCollection, options: DataListOptions = {}): Promise<Row[]> {
  if (collection === 'UsageLog') return usageRepo.list(options) as Promise<Row[]>;
  if (collection === 'User') {
    const rows = await repository(collection).list(options);
    const users = await Promise.all(rows.map((row) => userRepo.findById(row.id)));
    return users.filter((user): user is NonNullable<typeof user> => Boolean(user)) as Row[];
  }
  return repository(collection).list(options);
}

async function count(collection: DataCollection, filters: DataFilter[] = []): Promise<number> {
  if (collection === 'UsageLog') return (await usageRepo.list({ filters })).length;
  return repository(collection).count({ filters });
}

async function byId(collection: DataCollection, id: string): Promise<Row | null> {
  if (collection === 'User') return userRepo.findById(id);
  return repository(collection).get(id);
}

async function save(collection: DataCollection, id: string, value: Record<string, unknown>): Promise<void> {
  await repository(collection).set(id, value);
}

async function update(collection: DataCollection, id: string, value: Record<string, unknown>): Promise<boolean> {
  return repository(collection).update(id, value);
}

async function remove(collection: DataCollection, id: string): Promise<boolean> {
  return repository(collection).delete(id);
}

async function removeWhere(collection: DataCollection, predicate: (row: Row) => boolean): Promise<number> {
  const matches = (await all(collection)).filter(predicate);
  await Promise.all(matches.map((row) => remove(collection, row.id)));
  return matches.length;
}

async function findOne(collection: DataCollection, predicate: (row: Row) => boolean): Promise<Row | undefined> {
  return (await all(collection)).find(predicate);
}

function number(value: unknown): number {
  return Number(value) || 0;
}

function isTrue(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function dateValue(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function like(value: unknown, pattern: string, insensitive = true): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, insensitive ? 'i' : '').test(String(value ?? ''));
}

function datePart(value: unknown): string {
  return String(value ?? '').slice(0, 10);
}

function orderRows<T extends Row>(rows: T[], field: string, direction: 'asc' | 'desc' = 'asc'): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (left == null && right != null) return -1 * sign;
    if (left != null && right == null) return 1 * sign;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * sign;
    return String(left ?? '').localeCompare(String(right ?? ''), undefined, { sensitivity: 'base' }) * sign;
  });
}

const ApiSchema = z.object({
  name: z.string().trim().min(2).max(80),
  baseUrl: z.string().url().max(300).refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname);
  }, 'Use HTTPS for external API URLs.'),
  apiKey: z.string().trim().min(1).max(500).optional(),
  provider: z.string().trim().min(2).max(40).default('openai-compatible'),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(1),
});
const AdminUserSchema = z.object({ email: z.string().trim().email().max(254) });
const ImportedModelsSchema = z.object({
  apiId: z.string().min(1).max(120),
  models: z.array(z.object({
    id: z.string().trim().min(1).max(79),
    name: z.string().trim().min(1).max(120),
    apiModelId: z.string().trim().min(1).max(120).optional(),
    costTier: z.enum(['low', 'medium', 'high']).optional(),
  })).min(1).max(500),
});
const ModelUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  publicName: z.string().trim().min(1).max(80).optional(),
  costTier: z.enum(['low', 'medium', 'high']).optional(),
  isEnabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});
const BayanOneConfigSchema = z.object({
  active: z.boolean(),
  modelIds: z.array(z.string().trim().min(1).max(160)).max(500),
  autoLinkNewApis: z.boolean(),
}).refine((config) => new Set(config.modelIds).size === config.modelIds.length, 'Each model can only be linked once.');
const CintraModelRoutesSchema = z.object({
  'cintra-core-v1': z.array(z.string().trim().min(1).max(240)).max(500),
  'cintra-research': z.array(z.string().trim().min(1).max(240)).max(500),
  'cintra-creative': z.array(z.string().trim().min(1).max(240)).max(500),
  'cintra-analyst': z.array(z.string().trim().min(1).max(240)).max(500),
}).superRefine((routes, context) => {
  for (const model of CINTRA_MODELS) {
    const modelIds = routes[model.id];
    if (new Set(modelIds).size !== modelIds.length) {
      context.addIssue({ code: 'custom', path: [model.id], message: 'Each model route can only be linked once.' });
    }
  }
});
const ServiceApiRoutesSchema = z.object({
  image: z.string().trim().min(1).max(120).nullable(),
  search: z.string().trim().min(1).max(120).nullable(),
  speech: z.string().trim().min(1).max(120).nullable(),
  transcription: z.string().trim().min(1).max(120).nullable(),
  embeddings: z.string().trim().min(1).max(120).nullable(),
});
const SettingsSchema = z.object({
  dailyMessageLimit: z.number().int().min(0).max(10000),
  maxUploadSizeMb: z.number().int().min(1).max(50),
  studyModeEnabled: z.boolean(),
  guestLoginEnabled: z.boolean(),
  highTierCredits: z.number().int().min(0).max(100000),
  mediumTierCredits: z.number().int().min(0).max(100000),
  lowTierCredits: z.number().int().min(0).max(100000),
  proPlanPrice: z.number().min(0).max(1000000),
  logRetentionDays: z.number().int().min(1).max(3650),
  ipWhitelist: z.string().max(2000).default(''),
  imageModel: z.string().trim().min(1).max(120),
});
const AnnouncementSchema = z.object({
  message: z.string().trim().min(1).max(500),
  durationHours: z.number().int().min(1).max(168),
});

const getAdminId = (req: Request) => String((req as any).adminId || 'zeyad');

async function audit(req: Request, action: string, target = '', details = ''): Promise<void> {
  const id = randomUUID();
  await repository('AdminLog').create(id, {
    adminId: getAdminId(req), action, target, details, timestamp: new Date().toISOString(),
  });
}

function requireConfirmation(req: Request, res: Response): boolean {
  if (typeof (req as any).adminId === 'string') return true;
  res.status(401).json({ error: { code: 'ADMIN_UNAUTHORIZED', message: 'Admin login required.' } });
  return false;
}

async function setting(key: string, fallback: string): Promise<string> {
  return cachedAdminSetting(key, async () => {
    const record = await byId('AdminSetting', key);
    return record ? String(record.value) : fallback;
  });
}

async function setSetting(key: string, value: string, updatedAt = new Date().toISOString()): Promise<void> {
  await save('AdminSetting', key, { key, value, updatedAt });
  invalidateAdminSetting(key);
}

function nextQuotaReset(period: 'daily' | 'monthly'): string {
  const reset = new Date();
  if (period === 'daily') reset.setUTCDate(reset.getUTCDate() + 1);
  else reset.setUTCMonth(reset.getUTCMonth() + 1);
  return reset.toISOString();
}

function providerHttpError(status: number, operation: 'chat' | 'models'): string {
  if (status === 401) {
    return 'HTTP 401: The provider rejected the API key. Verify that it is valid, active, and issued for this provider and base URL.';
  }
  if (status === 403) {
    return 'HTTP 403: The provider denied access. The key may be valid but lack permission for this model or endpoint, or the provider account may be restricted.';
  }
  if (status === 404 && operation === 'models') {
    return 'HTTP 404: The model-list endpoint was not found. Verify the provider base URL and its /v1 path.';
  }
  if (status === 404) {
    return 'HTTP 404: The chat endpoint or selected model was not found. Verify the chat route and the provider model ID.';
  }
  if (status === 429) {
    return 'HTTP 429: The provider rate limit or quota was reached.';
  }
  if (status === 400) {
    return 'HTTP 400: The provider rejected the request. Verify that the selected model and request format are supported.';
  }
  return `Provider returned HTTP ${status}.`;
}

async function quotaForApi(apiId: string): Promise<Row | undefined> {
  return findOne('APIQuota', (row) => String(row.apiId) === apiId);
}

async function ensureQuotaRows(): Promise<void> {
  const apis = await all('APIConfiguration');
  for (const api of apis) {
    if (await quotaForApi(String(api.id))) continue;
    const id = randomUUID();
    await repository('APIQuota').create(id, {
      apiId: api.id, quotaLimit: 0, quotaPeriod: 'monthly', quotaUsed: 0, resetDate: nextQuotaReset('monthly'),
    });
  }
}

async function ensureBuiltinApi(): Promise<void> {
  if (await setting('cleanapisBuiltinDeleted', 'false') === 'true') return;
  const config = getCleanApisConfig();
  if (!(await byId('APIConfiguration', 'cleanapis-default'))) {
    await repository('APIConfiguration').create('cleanapis-default', {
      name: 'FreeLLMAPI', baseUrl: config.baseUrl, apiKey: encryptAdminSecret(config.apiKey),
      provider: 'openai-compatible', isActive: Boolean(config.apiKey), priority: 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }
  if (!(await quotaForApi('cleanapis-default'))) {
    await repository('APIQuota').create(randomUUID(), {
      apiId: 'cleanapis-default', quotaLimit: 0, quotaPeriod: 'monthly', quotaUsed: 0, resetDate: nextQuotaReset('monthly'),
    });
  }
}

async function seedBuiltinModels(): Promise<void> {
  await ensureBuiltinApi();
  if (!(await byId('APIConfiguration', 'cleanapis-default'))) return;
  for (const model of getCleanApisConfig().models) {
    if (!(await byId('ModelConfig', model.id))) {
      await repository('ModelConfig').create(model.id, {
        name: model.name, apiId: 'cleanapis-default', apiModelId: model.id, costTier: 'medium', isEnabled: true, usageCount: 0,
      });
    }
  }
}

async function applyEnabledModels(): Promise<void> {
  const initialized = await setting('modelsConfigured', 'false') === 'true';
  let [apiRows, modelRows] = await Promise.all([all('APIConfiguration'), all('ModelConfig')]);
  if (!modelRows.length && initialized) {
    await seedBuiltinModels();
    [apiRows, modelRows] = await Promise.all([all('APIConfiguration'), all('ModelConfig')]);
  }
  const providers: Array<{ id: string; apiKey: string; baseUrl: string; isActive: boolean; priority: number }> = [];
  for (const api of apiRows) {
    try {
      providers.push({
        id: String(api.id), apiKey: decryptAdminSecret(String(api.apiKey || '')),
        baseUrl: String(api.baseUrl || ''), isActive: isTrue(api.isActive), priority: Number(api.priority || 1),
      });
    } catch (error) {
      console.error(`API configuration ${String(api.id)} could not be decrypted:`, error);
    }
  }
  const apiProviders = new Map(apiRows.map((api) => [String(api.id), String(api.provider)]));
  const models = modelRows.map((model) => ({
    id: String(model.id), name: String(model.name), apiId: String(model.apiId),
    publicName: String(model.publicName || ''), publicId: String(model.publicId || ''),
    isPublic: isTrue(model.isPublic), isEnabled: isTrue(model.isEnabled),
    apiModelId: String(model.apiModelId || model.id),
    provider: apiProviders.get(String(model.apiId)) || 'other',
    costTier: String(model.costTier || ''),
  }));
  setRuntimeProviderRouting(providers, models);
  const rawServiceRoutes = await setting('serviceApiRoutes', '');
  let serviceRoutes = DEFAULT_SERVICE_API_ROUTES;
  if (!rawServiceRoutes) {
    await setSetting('serviceApiRoutes', JSON.stringify(serviceRoutes));
  } else {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawServiceRoutes);
    } catch (error) {
      throw new Error('Stored service API routes are not valid JSON.', { cause: error });
    }
    const parsed = ServiceApiRoutesSchema.safeParse(decoded);
    if (!parsed.success) throw new Error(`Stored service API routes are invalid: ${parsed.error.issues[0]?.message}`);
    const existingApiIds = new Set(apiRows.map((api) => String(api.id)));
    serviceRoutes = Object.fromEntries(SERVICE_API_CAPABILITIES.map((capability) => [
      capability,
      parsed.data[capability] && existingApiIds.has(parsed.data[capability])
        ? parsed.data[capability]
        : null,
    ])) as ServiceApiRoutes;
    if (JSON.stringify(serviceRoutes) !== JSON.stringify(parsed.data)) {
      await setSetting('serviceApiRoutes', JSON.stringify(serviceRoutes));
    }
  }
  setRuntimeServiceApiRoutes(serviceRoutes);
  if (!modelRows.length && !initialized) return;
  const configSetting = await setting('bayanOneConfig', '');
  let bayanOneConfig: BayanOneConfig;
  if (configSetting) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(configSetting);
    } catch (error) {
      throw new Error('Stored Bayan One configuration is not valid JSON.', { cause: error });
    }
    const parsed = BayanOneConfigSchema.safeParse(decoded);
    if (!parsed.success) throw new Error(`Stored Bayan One configuration is invalid: ${parsed.error.issues[0]?.message}`);
    const existingModelIds = new Set(modelRows
      .filter((model) => apiRows.some((api) => String(api.id) === String(model.apiId)))
      .map((model) => String(model.id)));
    const modelIds = parsed.data.modelIds.filter((id) => existingModelIds.has(id));
    bayanOneConfig = { ...parsed.data, modelIds };
    if (modelIds.length !== parsed.data.modelIds.length) {
      await setSetting('bayanOneConfig', JSON.stringify(bayanOneConfig));
    }
  } else {
    const activeApis = apiRows
      .filter((api) => isTrue(api.isActive) && providers.some((provider) => provider.id === String(api.id) && provider.apiKey))
      .sort((left, right) => number(left.priority) - number(right.priority) || String(left.name).localeCompare(String(right.name)));
    const primaryApi = activeApis[0];
    const configuredDefault = getCleanApisConfig().defaultModel;
    const firstModel = primaryApi && models
      .filter((model) => model.apiId === String(primaryApi.id) && model.isEnabled)
      .sort((left, right) =>
        Number(right.id === configuredDefault || right.apiModelId === configuredDefault)
          - Number(left.id === configuredDefault || left.apiModelId === configuredDefault)
          || left.name.localeCompare(right.name),
      )[0];
    bayanOneConfig = {
      active: Boolean(firstModel),
      modelIds: firstModel ? [firstModel.id] : [],
      autoLinkNewApis: false,
    };
    await setSetting('bayanOneConfig', JSON.stringify(bayanOneConfig));
  }
  setRuntimeBayanOneConfig(bayanOneConfig);
  const rawCintraRoutes = await setting('cintraModelRoutes', '');
  let cintraRoutes: CintraModelRoutes;
  if (rawCintraRoutes) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawCintraRoutes);
    } catch (error) {
      throw new Error('Stored Cintra model routes are not valid JSON.', { cause: error });
    }
    const parsed = CintraModelRoutesSchema.safeParse(decoded);
    if (!parsed.success) throw new Error(`Stored Cintra model routes are invalid: ${parsed.error.issues[0]?.message}`);
    const enabledModelIds = new Set(models.filter((model) => model.isEnabled).map((model) => model.id));
    const existingApiIds = new Set(apiRows.map((api) => String(api.id)));
    const validRouteId = (id: string) => id.startsWith(AUTO_CINTRA_ROUTE_PREFIX)
      ? existingApiIds.has(id.slice(AUTO_CINTRA_ROUTE_PREFIX.length))
      : enabledModelIds.has(id);
    cintraRoutes = {
      'cintra-core-v1': parsed.data['cintra-core-v1'].filter(validRouteId),
      'cintra-research': parsed.data['cintra-research'].filter(validRouteId),
      'cintra-creative': parsed.data['cintra-creative'].filter(validRouteId),
      'cintra-analyst': parsed.data['cintra-analyst'].filter(validRouteId),
    };
  } else {
    cintraRoutes = createDefaultCintraModelRoutes(models, bayanOneConfig.modelIds);
    await setSetting('cintraModelRoutes', JSON.stringify(cintraRoutes));
  }
  setRuntimeCintraModelRoutes(cintraRoutes);
  setRuntimeEnabledModels(models.filter((model) => model.apiId === 'cleanapis-default' && model.isEnabled).map((model) => model.id));
}

async function autoLinkBayanOneModels(modelIds: string[]): Promise<void> {
  if (!modelIds.length) return;
  const rawConfig = await setting('bayanOneConfig', '');
  if (!rawConfig) return;
  const parsed = BayanOneConfigSchema.safeParse(JSON.parse(rawConfig));
  if (!parsed.success || !parsed.data.autoLinkNewApis) return;
  const modelRows = await all('ModelConfig');
  const apis = await all('APIConfiguration');
  const modelById = new Map(modelRows.map((model) => [String(model.id), model]));
  const currentLinkedModels = parsed.data.modelIds
    .map((id) => modelById.get(id))
    .filter((model): model is Row => Boolean(model))
    .map((model) => ({ id: String(model.id), apiId: String(model.apiId) }));
  const newModels = modelIds
    .map((id) => modelById.get(id))
    .filter((model): model is Row => Boolean(model))
    .map((model) => ({ id: String(model.id), apiId: String(model.apiId), isEnabled: isTrue(model.isEnabled) }));
  const linkedModelIds = autoLinkBayanOneModelIds(
    parsed.data,
    currentLinkedModels,
    newModels,
    new Set(apis.map((api) => String(api.id))),
  );
  if (linkedModelIds.length !== parsed.data.modelIds.length) {
    await setSetting('bayanOneConfig', JSON.stringify({ ...parsed.data, modelIds: linkedModelIds }));
    const rawCintraRoutes = await setting('cintraModelRoutes', '');
    if (rawCintraRoutes) {
      const routesParsed = CintraModelRoutesSchema.safeParse(JSON.parse(rawCintraRoutes));
      if (!routesParsed.success) throw new Error(`Stored Cintra model routes are invalid: ${routesParsed.error.issues[0]?.message}`);
      await setSetting('cintraModelRoutes', JSON.stringify({
        ...routesParsed.data,
        'cintra-core-v1': linkedModelIds,
      }));
    }
  }
}
async function removeUpload(fileUrl: string): Promise<void> {
  if (!fileUrl.startsWith('local://')) {
    throw new Error('Attachment storage reference is invalid.');
  }
  if (!(await deleteLocalFile(fileUrl))) {
    throw new Error('Local storage attachment was not found.');
  }
}

adminRouter.get('/announcements', asyncRoute(async (_req, res) => {
  const announcement = await byId('Announcement', 'active');
  const active = Boolean(
    announcement
    && announcement.isActive !== false
    && dateValue(announcement.expiresAt) > Date.now(),
  );
  res.json({ announcement: announcement ? { ...announcement, active } : null });
}));

adminRouter.post('/announcements', asyncRoute(async (req, res) => {
  const parsed = AnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: parsed.error.issues[0]?.message || 'Enter a message and a valid duration.' } });
  }
  const now = new Date();
  const announcement = {
    announcementId: randomUUID(),
    message: parsed.data.message,
    durationHours: parsed.data.durationHours,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + parsed.data.durationHours * 60 * 60 * 1000).toISOString(),
    createdBy: getAdminId(req),
    isActive: true,
  };
  await save('Announcement', 'active', announcement);
  await audit(req, 'announcement.broadcast', 'all-users', JSON.stringify({
    durationHours: announcement.durationHours,
    expiresAt: announcement.expiresAt,
  }));
  res.json({ announcement: { id: 'active', ...announcement, active: true } });
}));

adminRouter.delete('/announcements', asyncRoute(async (req, res) => {
  const announcement = await byId('Announcement', 'active');
  if (!announcement) return res.status(404).json({ error: { message: 'There is no announcement to stop.' } });
  await update('Announcement', 'active', { isActive: false, updatedAt: new Date().toISOString() });
  await audit(req, 'announcement.stop', 'all-users');
  res.json({ success: true });
}));

adminRouter.get('/stats', asyncRoute(async (_req, res) => {
  if (adminStatsCache && adminStatsCache.expiresAt > Date.now()) {
    return res.json(adminStatsCache.data);
  }
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = start.toISOString().slice(0, 10);
  const collections: DataCollection[] = [
    'User', 'UsageLog', 'Conversation', 'Message', 'MessageAudio', 'Attachment', 'Feedback', 'StudyNote',
    'StudyArtifact', 'PDFDocument', 'PDFOperation', 'Agent', 'AgentAction', 'AgentApproval', 'Subscription',
    'Payment', 'ProcessedStripeEvent', 'PendingUpload', 'SharedLink', 'APIConfiguration', 'APIQuota',
    'APIQuotaUsage', 'APILog', 'ModelConfig', 'AdminLog', 'AdminSetting', 'ApiRequestLog', 'UserEventLog',
    'SystemLog', 'BackupLog', 'Account', 'Session', 'PasswordReset', 'AdminUser', 'AdminSession', 'AdminAllowlist',
  ];
  const countEntries = await Promise.all(collections.map(async (collection) =>
    [collection, await count(collection)] as const,
  ));
  const collectionCounts = new Map<DataCollection, number>(countEntries);
  const [
    guestUsers, userMessages, todayUsage, usage, models, apiConfig, imagesGenerated,
    successfulRequests, recentUsers, apiTimes,
  ] = await Promise.all([
    count('User', [{ field: 'isGuest', op: 'in', value: [true, 1, '1'] }]),
    count('Message', [{ field: 'role', op: '==', value: 'user' }]),
    all('UsageLog', { filters: [{ field: 'date', op: '==', value: today }] }),
    all('UsageLog'),
    all('ModelConfig'),
    all('APIConfiguration'),
    count('UserEventLog', [{ field: 'event', op: '==', value: 'image.generate' }]),
    count('ApiRequestLog', [
      { field: 'status', op: '>=', value: 200 },
      { field: 'status', op: '<=', value: 399 },
    ]),
    all('User', { filters: [{ field: 'createdAt', op: '>=', value: `${startDate}T00:00:00.000Z` }] }),
    all('ApiRequestLog', { filters: [{ field: 'createdAt', op: '>=', value: `${startDate}T00:00:00.000Z` }] }),
  ]);
  const recentUsage = usage.filter((row) => datePart(row.date) >= startDate);
  const dailyCounts = new Map<string, number>();
  for (const row of recentUsage) dailyCounts.set(datePart(row.date), (dailyCounts.get(datePart(row.date)) || 0) + number(row.count));
  const modelCounts = new Map<string, number>();
  for (const row of usage) if (row.model != null) modelCounts.set(String(row.model), (modelCounts.get(String(row.model)) || 0) + number(row.count));
  const growthCounts = new Map<string, number>();
  for (const row of recentUsers) {
    const day = datePart(row.createdAt);
    growthCounts.set(day, (growthCounts.get(day) || 0) + 1);
  }
  const timeCounts = new Map<string, { sum: number; count: number }>();
  for (const row of apiTimes) {
    const day = datePart(row.createdAt);
    const current = timeCounts.get(day) || { sum: 0, count: 0 };
    current.sum += number(row.durationMs);
    current.count += 1;
    timeCounts.set(day, current);
  }
  const dates = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (29 - index));
    return date.toISOString().slice(0, 10);
  });
  const mapSeries = (values: Map<string, number>) => dates.map((date) => ({ date, value: values.get(date) || 0 }));
  const databaseBytes = (await Promise.all(collections.map(async (collection) =>
    {
      const sample = await all(collection, { limit: 10 });
      if (!sample.length) return 0;
      const averageBytes = sample.reduce((total, record) =>
        total + Buffer.byteLength(JSON.stringify(record)), 0) / sample.length;
      return Math.round(averageBytes * (collectionCounts.get(collection) || 0));
    },
  ))).reduce((sum, size) => sum + size, 0);
  const fileBytes = await localStorageUsageBytes();
  const topModels = [...modelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const activeApis = apiConfig.filter((api) => isTrue(api.isActive)).length;
  const totalUsers = collectionCounts.get('User') || 0;
  const totalApiRequests = collectionCounts.get('ApiRequestLog') || 0;
  const data = {
    cards: {
      totalUsers, registeredUsers: totalUsers - guestUsers, guestUsers,
      totalMessages: userMessages,
      totalConversations: collectionCounts.get('Conversation') || 0,
      activeUsersToday: new Set(todayUsage.map((row) => String(row.userId))).size,
      serverStatus: 'up',
      storageMb: fileBytes === null
        ? null
        : Number(((databaseBytes + fileBytes) / 1024 / 1024).toFixed(2)),
      apiSuccessRate: totalApiRequests ? Number((successfulRequests / totalApiRequests * 100).toFixed(1)) : 0,
      activeApis, imagesGenerated,
      pdfsProcessed: collectionCounts.get('PDFDocument') || 0,
      agentTasks: collectionCounts.get('Agent') || 0,
    },
    charts: {
      messagesPerDay: mapSeries(dailyCounts), userGrowth: mapSeries(growthCounts),
      responseTimes: mapSeries(new Map([...timeCounts].map(([day, item]) => [day, Math.round(item.sum / item.count)]))),
      models: topModels.map(([name, value]) => ({ name, value })),
    },
  };
  adminStatsCache = { data, expiresAt: Date.now() + 5 * 60_000 };
  res.json(data);
}));

adminRouter.get('/users', asyncRoute(async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const requestedLimit = Number.parseInt(String(req.query.limit || '10'), 10) || 10;
  const limit = [10, 25, 50].includes(requestedLimit) ? requestedLimit : 10;
  const search = String(req.query.search || '').trim().slice(0, 100);
  const plan = ['free', 'pro'].includes(String(req.query.plan)) ? String(req.query.plan) : '';
  const status = ['active', 'inactive', 'banned'].includes(String(req.query.status)) ? String(req.query.status) : '';
  const sortColumns: Record<string, string> = { name: 'name', email: 'email', plan: 'plan', createdAt: 'createdAt', lastActive: 'lastActive', status: 'status' };
  const orderBy = sortColumns[String(req.query.sort)] || 'createdAt';
  const direction = String(req.query.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const defaultDailyMessageLimit = Number(await setting('dailyMessageLimit', '50'));
  const canQueryPage = !search
    && !['active', 'inactive'].includes(status)
    && orderBy === 'createdAt';
  if (canQueryPage) {
    const filters: DataFilter[] = [];
    if (plan) filters.push({ field: 'plan', op: '==', value: plan });
    if (status === 'banned') filters.push({ field: 'isBanned', op: 'in', value: [1, true, '1'] });
    const [pageUsers, total] = await Promise.all([
      all('User', {
        filters,
        orderBy: [{ field: orderBy, direction }],
        limit,
        offset: (page - 1) * limit,
      }),
      count('User', filters),
    ]);
    const userIds = pageUsers.map((user) => String(user.id));
    const usage: Row[] = [];
    for (let offset = 0; offset < userIds.length; offset += 30) {
      usage.push(...await all('UsageLog', {
        filters: [{ field: 'userId', op: 'in', value: userIds.slice(offset, offset + 30) }],
      }));
    }
    const latestByUser = new Map<string, string>();
    for (const row of usage) {
      const userId = String(row.userId);
      const day = datePart(row.date);
      if (day > (latestByUser.get(userId) || '')) latestByUser.set(userId, day);
    }
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    return res.json({
      users: pageUsers.map((user) => {
        const lastActive = latestByUser.get(String(user.id)) || null;
        return {
          id: user.id, name: user.name, email: user.email, plan: user.plan,
          dailyMessageLimit: user.dailyMessageLimitOverride ?? defaultDailyMessageLimit,
          dailyMessageLimitOverride: user.dailyMessageLimitOverride ?? null,
          isGuest: isTrue(user.isGuest), isBanned: isTrue(user.isBanned), role: user.role,
          createdAt: user.createdAt, lastActive,
          status: isTrue(user.isBanned) ? 'banned' : lastActive && lastActive >= cutoffDate ? 'active' : 'inactive',
        };
      }),
      page, limit, total,
    });
  }
  const [users, usage] = await Promise.all([all('User'), all('UsageLog')]);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const activeUsers = new Set(usage.filter((row) => datePart(row.date) >= cutoffDate).map((row) => String(row.userId)));
  const processed = users.map((user) => {
    const userUsage = usage.filter((row) => String(row.userId) === String(user.id));
    const latest = userUsage.map((row) => datePart(row.date)).sort().at(-1) || null;
    const userStatus = isTrue(user.isBanned) ? 'banned' : activeUsers.has(String(user.id)) ? 'active' : 'inactive';
    return {
      id: user.id, name: user.name, email: user.email, plan: user.plan, isGuest: user.isGuest,
      dailyMessageLimit: user.dailyMessageLimitOverride ?? defaultDailyMessageLimit,
      dailyMessageLimitOverride: user.dailyMessageLimitOverride ?? null,
      isBanned: user.isBanned, role: user.role, createdAt: user.createdAt, lastActive: latest, status: userStatus,
    };
  }).filter((user) =>
    (!search || like(user.name, `%${search}%`) || like(user.email, `%${search}%`))
    && (!plan || user.plan === plan)
    && (!status || user.status === status)
    && (!['active', 'inactive'].includes(status) || user.isBanned === false || user.isBanned === 0));
  orderRows(processed, orderBy, direction);
  const total = processed.length;
  res.json({
    users: processed.slice((page - 1) * limit, page * limit).map((row) => ({ ...row, isGuest: isTrue(row.isGuest), isBanned: isTrue(row.isBanned) })),
    page, limit, total,
  });
}));

adminRouter.get('/users/:id', asyncRoute(async (req, res) => {
  const user = await byId('User', req.params.id);
  if (!user) return res.status(404).json({ error: { message: 'User not found.' } });
  const defaultDailyMessageLimit = Number(await setting('dailyMessageLimit', '50'));
  const [userConversations, userUsage, userEvents] = await Promise.all([
    all('Conversation', { filters: [{ field: 'userId', op: '==', value: req.params.id }] }),
    all('UsageLog', { filters: [{ field: 'userId', op: '==', value: req.params.id }] }),
    all('UserEventLog', {
      filters: [{ field: 'userId', op: '==', value: req.params.id }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit: 20,
    }),
  ]);
  res.json({
    user: {
      id: user.id, name: user.name, email: user.email, plan: user.plan, isGuest: isTrue(user.isGuest),
      isBanned: isTrue(user.isBanned), role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt,
      creditBalance: user.creditBalance,
      dailyMessageLimit: user.dailyMessageLimitOverride ?? defaultDailyMessageLimit,
      dailyMessageLimitOverride: user.dailyMessageLimitOverride ?? null,
    },
    conversationCount: userConversations.length, messageCount: userUsage.reduce((sum, row) => sum + number(row.count), 0),
    events: userEvents.map(({ event, details, createdAt }) => ({ event, details, createdAt })),
  });
}));

adminRouter.post('/users/:id/ban', asyncRoute(async (req, res) => {
  const isBanned = req.body?.isBanned === undefined ? true : Boolean(req.body.isBanned);
  const target = await byId('User', req.params.id);
  if (!target) return res.status(404).json({ error: { message: 'User not found.' } });
  const authUser = await findLocalUserForProfile(target);
  if (
    target.role === 'admin'
  ) {
    return res.status(403).json({ error: { message: 'The admin account cannot be banned.' } });
  }
  if (!isBanned && target.authDeletedAt) {
    return res.status(409).json({ error: { message: 'A deleted local account cannot be enabled.' } });
  }
  if (authUser) await disableLocalUser(authUser.$id, isBanned);
  if (!(await update('User', req.params.id, { isBanned, updatedAt: new Date().toISOString() }))) return res.status(404).json({ error: { message: 'User not found.' } });
  await audit(req, isBanned ? 'user.ban' : 'user.unban', req.params.id);
  res.json({ success: true, isBanned });
}));

adminRouter.put('/users/:id', asyncRoute(async (req, res) => {
  const parsed = z.object({
    plan: z.enum(['free', 'pro', 'pro_plus']).optional(),
    dailyMessageLimitOverride: z.number().int().min(0).max(10000).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success || (parsed.data.plan === undefined && parsed.data.dailyMessageLimitOverride === undefined)) {
    return res.status(400).json({ error: { message: 'Choose a valid user update.' } });
  }
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (parsed.data.plan !== undefined) updates.plan = parsed.data.plan;
  if (parsed.data.dailyMessageLimitOverride !== undefined) {
    updates.dailyMessageLimitOverride = parsed.data.dailyMessageLimitOverride;
  }
  if (!(await update('User', req.params.id, updates))) return res.status(404).json({ error: { message: 'User not found.' } });
  await audit(req, 'user.update', req.params.id, JSON.stringify(updates));
  res.json({ success: true });
}));

adminRouter.put('/users/:id/credentials', asyncRoute(async (req, res) => {
  const parsed = z.object({
    email: z.string().trim().email().max(254).optional(),
    newPassword: z.string().min(12).max(100)
      .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password is too long.')
      .optional(),
  }).safeParse(req.body);
  if (!parsed.success || (!parsed.data.email && !parsed.data.newPassword)) {
    return res.status(400).json({ error: { message: parsed.success ? 'Enter an email or a new password.' : parsed.error.issues[0]?.message } });
  }
  const target = await byId('User', req.params.id);
  if (!target) return res.status(404).json({ error: { message: 'User not found.' } });
  if (isTrue(target.isGuest) || target.role === 'admin') {
    return res.status(403).json({ error: { message: 'Credentials can only be changed for registered user accounts.' } });
  }
  const authUser = await findLocalUserForProfile(target);
  if (!authUser) return res.status(404).json({ error: { message: 'Local account was not found.' } });
  try {
    await updateLocalAccountCredentials(authUser.$id, {
      email: parsed.data.email,
      password: parsed.data.newPassword,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && Number((error as { code: unknown }).code) === 409) {
      return res.status(409).json({ error: { message: 'An account with this email already exists.' } });
    }
    throw error;
  }
  await audit(req, 'user.credentials.update', req.params.id, parsed.data.email ? 'email and/or password updated' : 'password updated');
  res.json({ success: true });
}));

adminRouter.get('/account', asyncRoute(async (req, res) => {
  const adminId = String((req as any).adminId);
  const profile = await userRepo.findByAuthId(adminId);
  if (!profile) return res.status(404).json({ error: { message: 'Admin account profile was not found.' } });
  res.json({ email: profile.email, name: profile.name });
}));

adminRouter.put('/account', asyncRoute(async (req, res) => {
  const parsed = z.object({
    email: z.string().trim().email().max(254).optional(),
    password: z.string().min(12).max(100)
      .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password is too long.')
      .optional(),
  }).safeParse(req.body);
  if (!parsed.success || (!parsed.data.email && !parsed.data.password)) {
    return res.status(400).json({ error: { message: parsed.success ? 'Enter an email or a new password.' : parsed.error.issues[0]?.message } });
  }
  const adminId = String((req as any).adminId);
  const profile = await userRepo.findByAuthId(adminId);
  if (!profile?.email) return res.status(404).json({ error: { message: 'Admin account profile was not found.' } });
  const oldEmail = profile.email.trim().toLowerCase();
  const newEmail = (parsed.data.email || oldEmail).trim().toLowerCase();
  const emailChanged = newEmail !== oldEmail;
  const addedNewAllowlistEntry = emailChanged && !await isAdminEmailAllowed(newEmail);
  if (addedNewAllowlistEntry) await addAdminEmail(newEmail, adminId);
  try {
    await updateLocalAccountCredentials(adminId, {
      email: newEmail,
      password: parsed.data.password,
      currentSessionToken: (req as any).adminSessionToken,
    });
  } catch (error) {
    if (addedNewAllowlistEntry) await removeAdminEmail(newEmail);
    if (error && typeof error === 'object' && 'code' in error && Number((error as { code: unknown }).code) === 409) {
      return res.status(409).json({ error: { message: 'An account with this email already exists.' } });
    }
    throw error;
  }
  if (emailChanged) await removeAdminEmail(oldEmail);
  await setSetting('adminBootstrapSeeded', '1');
  await audit(req, 'admin.credentials.update', '', emailChanged ? 'email updated' : 'password updated');
  res.json({ success: true, email: newEmail });
}));

adminRouter.post('/users/:id/reset-limit', asyncRoute(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  await usageRepo.resetToday(req.params.id);
  await audit(req, 'user.daily-limit.reset', req.params.id, today);
  res.json({ success: true });
}));

adminRouter.get('/users/:id/conversations', asyncRoute(async (req, res) => {
  const conversations = await all('Conversation', {
    filters: [{ field: 'userId', op: '==', value: req.params.id }],
    orderBy: [{ field: 'updatedAt', direction: 'desc' }],
    limit: 100,
  });
  const messages: Row[] = [];
  for (let offset = 0; offset < conversations.length; offset += 30) {
    messages.push(...await all('Message', {
      filters: [{
        field: 'conversationId',
        op: 'in',
        value: conversations.slice(offset, offset + 30).map((row) => String(row.id)),
      }],
    }));
  }
  const result = conversations.map((conversation) => {
    const related = messages.filter((message) => String(message.conversationId) === String(conversation.id));
    return {
      id: conversation.id, title: conversation.title, model: conversation.model,
      createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
      messageCount: related.length, tokens: related.reduce((sum, message) => sum + number(message.tokens), 0),
    };
  });
  res.json({ conversations: result });
}));

adminRouter.delete('/users/:id', asyncRoute(async (req, res) => {
  if (!requireConfirmation(req, res)) return;
  const userId = req.params.id;
  const target = await byId('User', userId);
  if (!target) return res.status(404).json({ error: { message: 'User not found.' } });
  const authUser = await findLocalUserForProfile(target);
  if (
    target.role === 'admin'
  ) {
    return res.status(403).json({ error: { message: 'The admin account cannot be deleted.' } });
  }
  if (!await userRepo.delete(userId)) return res.status(404).json({ error: { message: 'User could not be deleted.' } });
  if (authUser) await deleteLocalUser(authUser.$id);
  adminStatsCache = null;
  await audit(req, 'user.delete', '', 'permanent deletion completed');
  res.json({ success: true, preservedConversationData: false });
}));

async function deleteConversation(conversationId: string, userId?: string): Promise<void> {
  const conversation = await byId('Conversation', conversationId);
  if (!conversation || (userId && String(conversation.userId) !== userId)) return;
  const messages = await all('Message');
  const messageIds = new Set(messages.filter((row) => String(row.conversationId) === conversationId).map((row) => String(row.id)));
  for (const collection of ['Feedback', 'StudyNote', 'StudyArtifact', 'Attachment'] as const) {
    await removeWhere(collection, (row) => messageIds.has(String(row.messageId)) || String(row.conversationId) === conversationId);
  }
  await removeWhere('Message', (row) => String(row.conversationId) === conversationId);
  await remove('Conversation', conversationId);
}

adminRouter.get('/conversations', asyncRoute(async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 100);
  if (!search) {
    const conversations = await all('Conversation', {
      orderBy: [{ field: 'updatedAt', direction: 'desc' }],
      limit: 100,
    });
    const userIds = [...new Set(conversations.map((conversation) => String(conversation.userId)))];
    const users: Row[] = [];
    const messages: Row[] = [];
    for (let offset = 0; offset < userIds.length; offset += 30) {
      users.push(...await all('User', {
        filters: [{ field: 'id', op: 'in', value: userIds.slice(offset, offset + 30) }],
      }));
    }
    for (let offset = 0; offset < conversations.length; offset += 30) {
      messages.push(...await all('Message', {
        filters: [{
          field: 'conversationId',
          op: 'in',
          value: conversations.slice(offset, offset + 30).map((row) => String(row.id)),
        }],
      }));
    }
    const usersById = new Map(users.map((row) => [String(row.id), row]));
    return res.json({
      conversations: conversations.flatMap((conversation) => {
        const user = usersById.get(String(conversation.userId));
        if (!user) return [];
        const related = messages.filter((message) => String(message.conversationId) === String(conversation.id));
        return [{
          id: conversation.id, title: conversation.title, model: conversation.model,
          createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
          userId: user.id, userName: user.name, userEmail: user.email,
          messageCount: related.length, tokenCount: related.reduce((sum, message) => sum + number(message.tokens), 0),
        }];
      }),
    });
  }
  const [conversations, users, messages] = await Promise.all([all('Conversation'), all('User'), all('Message')]);
  const usersById = new Map(users.map((row) => [String(row.id), row]));
  const result = conversations.flatMap((conversation) => {
    const user = usersById.get(String(conversation.userId));
    if (!user) return [];
    if (search && ![conversation.id, conversation.title, user.email, user.name].some((value) => like(value, `%${search}%`))) return [];
    const related = messages.filter((message) => String(message.conversationId) === String(conversation.id));
    return [{
      id: conversation.id, title: conversation.title, model: conversation.model,
      createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
      userId: user.id, userName: user.name, userEmail: user.email,
      messageCount: related.length, tokenCount: related.reduce((sum, message) => sum + number(message.tokens), 0),
    }];
  });
  res.json({ conversations: orderRows(result, 'updatedAt', 'desc').slice(0, 100) });
}));

adminRouter.get('/conversations/:id', asyncRoute(async (req, res) => {
  const conversation = await byId('Conversation', req.params.id);
  if (!conversation) return res.status(404).json({ error: { message: 'Conversation not found.' } });
  const [user, conversationMessages] = await Promise.all([
    byId('User', String(conversation.userId)),
    all('Message', {
      filters: [{ field: 'conversationId', op: '==', value: req.params.id }],
      orderBy: [{ field: 'createdAt', direction: 'asc' }],
    }),
  ]);
  const messageIds = conversationMessages.map((message) => String(message.id));
  const attachments: Row[] = [];
  for (let offset = 0; offset < messageIds.length; offset += 30) {
    attachments.push(...await all('Attachment', {
      filters: [{ field: 'messageId', op: 'in', value: messageIds.slice(offset, offset + 30) }],
    }));
  }
  const messages = orderRows(conversationMessages, 'createdAt');
  const exposedAttachments = attachments
    .map(({ id, messageId, fileName, fileType, fileSize }) => ({ id, messageId, fileName, fileType, fileSize }));
  res.json({
    conversation: { ...conversation, userName: user?.name, userEmail: user?.email },
    messages, attachments: exposedAttachments,
  });
}));

adminRouter.delete('/conversations/:id', asyncRoute(async (req, res) => {
  if (!requireConfirmation(req, res)) return;
  const conversation = await byId('Conversation', req.params.id);
  if (!conversation) return res.status(404).json({ error: { message: 'Conversation not found.' } });
  const messages = (await all('Message')).filter((row) => String(row.conversationId) === req.params.id);
  const messageIds = new Set(messages.map((row) => String(row.id)));
  const files = (await all('Attachment')).filter((row) => messageIds.has(String(row.messageId)));
  await deleteConversation(req.params.id, String(conversation.userId));
  for (const file of files) if (file.fileUrl) await removeUpload(String(file.fileUrl));
  await removeWhere('StudyNote', (row) => String(row.conversationId) === req.params.id);
  await removeWhere('StudyArtifact', (row) => String(row.conversationId) === req.params.id);
  await audit(req, 'conversation.delete', req.params.id, String(conversation.userId));
  res.json({ success: true });
}));

adminRouter.get('/apis', asyncRoute(async (_req, res) => {
  await ensureBuiltinApi();
  const [apis, logs, models] = await Promise.all([all('APIConfiguration'), all('ApiRequestLog'), all('ModelConfig')]);
  orderRows(apis, 'priority');
  apis.sort((a, b) => number(a.priority) - number(b.priority) || dateValue(a.createdAt) - dateValue(b.createdAt));
  res.json({ apis: apis.map((api) => {
    const apiLogs = logs.filter((row) => String(row.apiId) === String(api.id));
    const successes = apiLogs.filter((row) => number(row.status) >= 200 && number(row.status) <= 399).length;
    return {
      id: String(api.id), name: String(api.name), baseUrl: String(api.baseUrl), provider: String(api.provider),
      isActive: isTrue(api.isActive), priority: Number(api.priority || 1), apiKey: maskAdminSecret(String(api.apiKey || '')),
      modelCount: models.filter((model) => String(model.apiId) === String(api.id)).length,
      successRate: apiLogs.length ? Number((successes / apiLogs.length * 100).toFixed(1)) : 0,
      avgResponseMs: apiLogs.length ? Math.round(apiLogs.reduce((sum, row) => sum + number(row.durationMs), 0) / apiLogs.length) : 0,
      lastCall: orderRows(apiLogs, 'createdAt', 'desc')[0]?.createdAt || null, createdAt: String(api.createdAt || ''),
    };
  }) });
}));

adminRouter.get('/cintra-routes', asyncRoute(async (_req, res) => {
  await applyEnabledModels();
  const [apis, models] = await Promise.all([all('APIConfiguration'), all('ModelConfig')]);
  const parsed = CintraModelRoutesSchema.safeParse(JSON.parse(await setting('cintraModelRoutes', '{}')));
  if (!parsed.success) throw new Error(`Stored Cintra model routes are invalid: ${parsed.error.issues[0]?.message}`);
  const enabledModelIds = new Set(models.filter((model) => isTrue(model.isEnabled)).map((model) => String(model.id)));
  const existingApiIds = new Set(apis.map((api) => String(api.id)));
  const validRouteId = (id: string) => id.startsWith(AUTO_CINTRA_ROUTE_PREFIX)
    ? existingApiIds.has(id.slice(AUTO_CINTRA_ROUTE_PREFIX.length))
    : enabledModelIds.has(id);
  const config: CintraModelRoutes = {
    'cintra-core-v1': parsed.data['cintra-core-v1'].filter(validRouteId),
    'cintra-research': parsed.data['cintra-research'].filter(validRouteId),
    'cintra-creative': parsed.data['cintra-creative'].filter(validRouteId),
    'cintra-analyst': parsed.data['cintra-analyst'].filter(validRouteId),
  };
  const modelsByApi = new Map<string, Row[]>();
  for (const model of models) {
    if (!isTrue(model.isEnabled)) continue;
    const apiId = String(model.apiId);
    modelsByApi.set(apiId, [...(modelsByApi.get(apiId) || []), model]);
  }
  res.json({
    config,
    providers: apis
      .map((api) => ({
        id: String(api.id),
        name: String(api.name),
        isActive: isTrue(api.isActive),
        priority: number(api.priority),
        models: (modelsByApi.get(String(api.id)) || [])
          .map((model) => ({ id: String(model.id), name: String(model.name), apiModelId: String(model.apiModelId || model.id) })),
      }))
      .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name)),
  });
}));

adminRouter.put('/cintra-routes', asyncRoute(async (req, res) => {
  const parsed = CintraModelRoutesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: parsed.error.issues[0]?.message || 'Invalid Cintra model routes.' } });
  const [apis, models] = await Promise.all([all('APIConfiguration'), all('ModelConfig')]);
  const modelById = new Map(models.map((model) => [String(model.id), model]));
  for (const publicModel of CINTRA_MODELS) {
    const routeIds = parsed.data[publicModel.id];
    const selectedModels = routeIds.filter((id) => !id.startsWith(AUTO_CINTRA_ROUTE_PREFIX)).map((id) => modelById.get(id));
    if (selectedModels.some((model) => !model || !isTrue(model.isEnabled))) {
      return res.status(400).json({ error: { message: `Every ${publicModel.name} route must use an existing enabled model.` } });
    }
    const selectedApiIds = routeIds.map((id) => id.startsWith(AUTO_CINTRA_ROUTE_PREFIX)
      ? id.slice(AUTO_CINTRA_ROUTE_PREFIX.length)
      : String(modelById.get(id)?.apiId || ''));
    if (new Set(selectedApiIds).size !== selectedApiIds.length) {
      return res.status(400).json({ error: { message: `Choose at most one ${publicModel.name} route per API connection.` } });
    }
    if (selectedApiIds.some((id) => !apis.some((api) => String(api.id) === id))) {
      return res.status(400).json({ error: { message: `A selected ${publicModel.name} API connection no longer exists.` } });
    }
  }

  const routes = parsed.data;
  await setSetting('cintraModelRoutes', JSON.stringify(routes));
  const currentLegacyConfig = BayanOneConfigSchema.safeParse(JSON.parse(await setting('bayanOneConfig', '{}')));
  const coreModelRoutes = routes['cintra-core-v1'].filter((id) => !id.startsWith(AUTO_CINTRA_ROUTE_PREFIX));
  await setSetting('bayanOneConfig', JSON.stringify({
    active: coreModelRoutes.length > 0,
    modelIds: coreModelRoutes,
    autoLinkNewApis: currentLegacyConfig.success && currentLegacyConfig.data.autoLinkNewApis,
  }));
  await applyEnabledModels();
  await audit(req, 'cintra-model-routes.update', 'cintra-model-routes', JSON.stringify(routes));
  res.json({ success: true, config: routes });
}));

adminRouter.get('/service-api-routes', asyncRoute(async (_req, res) => {
  const [apis, raw] = await Promise.all([
    all('APIConfiguration'),
    setting('serviceApiRoutes', JSON.stringify(DEFAULT_SERVICE_API_ROUTES)),
  ]);
  const parsed = ServiceApiRoutesSchema.safeParse(JSON.parse(raw || JSON.stringify(DEFAULT_SERVICE_API_ROUTES)));
  if (!parsed.success) throw new Error(`Stored service API routes are invalid: ${parsed.error.issues[0]?.message}`);
  const apiIds = new Set(apis.map((api) => String(api.id)));
  const routes = Object.fromEntries(SERVICE_API_CAPABILITIES.map((capability) => [
    capability,
    parsed.data[capability] && apiIds.has(parsed.data[capability])
      ? parsed.data[capability]
      : null,
  ])) as ServiceApiRoutes;
  res.json({
    routes,
    providers: apis
      .map((api) => ({
        id: String(api.id),
        name: String(api.name),
        isActive: isTrue(api.isActive),
        priority: number(api.priority),
      }))
      .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name)),
  });
}));

adminRouter.put('/service-api-routes', asyncRoute(async (req, res) => {
  const parsed = ServiceApiRoutesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: parsed.error.issues[0]?.message || 'Invalid service API routes.' } });
  }
  const apiIds = new Set((await all('APIConfiguration')).map((api) => String(api.id)));
  const selectedIds = Object.values(parsed.data).filter((id): id is string => Boolean(id));
  if (selectedIds.some((id) => !apiIds.has(id))) {
    return res.status(400).json({ error: { message: 'Each service route must use an existing API connection.' } });
  }
  const routes = parsed.data;
  await setSetting('serviceApiRoutes', JSON.stringify(routes));
  setRuntimeServiceApiRoutes(routes);
  await audit(req, 'service-api-routes.update', 'service-api-routes', JSON.stringify(routes));
  res.json({ success: true, routes });
}));

adminRouter.get('/bayan-one', asyncRoute(async (_req, res) => {
  const [apis, models] = await Promise.all([all('APIConfiguration'), all('ModelConfig')]);
  const rawConfig = await setting('bayanOneConfig', '');
  let config: BayanOneConfig;
  if (rawConfig) {
    const parsed = BayanOneConfigSchema.safeParse(JSON.parse(rawConfig));
    if (!parsed.success) throw new Error(`Stored Bayan One configuration is invalid: ${parsed.error.issues[0]?.message}`);
    const availableModelIds = new Set(models
      .filter((model) => apis.some((api) => String(api.id) === String(model.apiId)))
      .map((model) => String(model.id)));
    config = { ...parsed.data, modelIds: parsed.data.modelIds.filter((id) => availableModelIds.has(id)) };
  } else {
    config = { active: false, modelIds: [], autoLinkNewApis: false };
  }
  const modelsByApi = new Map<string, Row[]>();
  for (const model of models) {
    const apiId = String(model.apiId);
    modelsByApi.set(apiId, [...(modelsByApi.get(apiId) || []), model]);
  }
  const primaryApiIds = new Set<string>();
  for (const modelId of config.modelIds) {
    const model = models.find((item) => String(item.id) === modelId);
    if (model && isTrue(model.isEnabled) && apis.some((api) => String(api.id) === String(model.apiId) && isTrue(api.isActive))) {
      primaryApiIds.add(String(model.apiId));
    }
  }
  res.json({
    model: { id: BAYAN_ONE_MODEL_ID, name: BAYAN_ONE_MODEL_NAME },
    config,
    providers: apis
      .map((api) => ({
        id: String(api.id),
        name: String(api.name),
        isActive: isTrue(api.isActive),
        priority: number(api.priority),
        primary: primaryApiIds.has(String(api.id))
          && !apis.some((candidate) => primaryApiIds.has(String(candidate.id))
            && isTrue(candidate.isActive)
            && number(candidate.priority) < number(api.priority)),
        models: (modelsByApi.get(String(api.id)) || [])
          .filter((model) => isTrue(model.isEnabled))
          .map((model) => ({ id: String(model.id), name: String(model.name), apiModelId: String(model.apiModelId || model.id) })),
      }))
      .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name)),
  });
}));

adminRouter.put('/bayan-one', asyncRoute(async (req, res) => {
  const parsed = BayanOneConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: parsed.error.issues[0]?.message || 'Invalid Bayan One configuration.' } });
  const [apis, models] = await Promise.all([all('APIConfiguration'), all('ModelConfig')]);
  const selectedModels = parsed.data.modelIds.map((id) => models.find((model) => String(model.id) === id));
  if (selectedModels.some((model) => !model)) {
    return res.status(400).json({ error: { message: 'Every Bayan One provider option must refer to an existing model.' } });
  }
  const selectedApiIds = selectedModels.map((model) => String(model!.apiId));
  if (new Set(selectedApiIds).size !== selectedApiIds.length) {
    return res.status(400).json({ error: { message: 'Select at most one Bayan One model per API connection.' } });
  }
  if (selectedApiIds.some((id) => !apis.some((api) => String(api.id) === id))) {
    return res.status(400).json({ error: { message: 'A selected Bayan One provider API no longer exists.' } });
  }
  await setSetting('bayanOneConfig', JSON.stringify(parsed.data));
  await applyEnabledModels();
  await audit(req, 'bayan-one.update', BAYAN_ONE_MODEL_ID, JSON.stringify({
    active: parsed.data.active,
    modelIds: parsed.data.modelIds,
    autoLinkNewApis: parsed.data.autoLinkNewApis,
  }));
  res.json({ success: true, config: parsed.data });
}));

adminRouter.get('/admin-users', asyncRoute(async (_req, res) => {
  const admins = await listAdminEmails();
  res.json({ users: admins.map((admin) => ({
    id: admin.email, username: admin.email, email: admin.email, isActive: admin.isActive, createdAt: admin.createdAt, lastLogin: null,
  })) });
}));

adminRouter.post('/admin-users', asyncRoute(async (req, res) => {
  const parsed = AdminUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: parsed.error.issues[0]?.message || 'Enter an email address for the allowlist.' } });
  const email = parsed.data.email.trim().toLowerCase();
  const authUser = await findLocalUserByEmail(email);
  if (!authUser) return res.status(404).json({ error: { message: 'Create the local account before granting administrator access.' } });
  if (!authUser.emailVerification) return res.status(409).json({ error: { message: 'Verify the account email before granting administrator access.' } });
  if (!authUser.status) return res.status(409).json({ error: { message: 'Enable the local account before granting administrator access.' } });
  try {
    await addAdminEmail(email, getAdminId(req));
    await grantAdminRole(authUser.$id);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: unknown }).code;
      if (Number(code) === 6 || code === 'already-exists') {
        return res.status(409).json({ error: { message: 'That email is already in the admin allowlist.' } });
      }
    }
    try {
      await removeAdminEmail(email);
    } catch (rollbackError) {
      console.error(`Could not roll back the administrator allowlist entry for ${email}:`, rollbackError);
    }
    console.error(`Could not grant administrator access to ${email}:`, error);
    throw error;
  }
  await audit(req, 'admin.user.allow', email, email);
  res.status(201).json({ id: email });
}));

adminRouter.put('/admin-users/:id/password', asyncRoute(async (_req, res) => {
  res.status(410).json({ error: { message: 'Use the local password-reset flow to change this account password.' } });
}));

adminRouter.delete('/admin-users/:id', asyncRoute(async (req, res) => {
  if (!requireConfirmation(req, res)) return;
  const email = req.params.id.trim().toLowerCase();
  if (email === String((req as any).adminEmail || '').toLowerCase()) return res.status(409).json({ error: { message: 'You cannot remove your own email from the admin allowlist.' } });
  const admins = await listAdminEmails();
  const target = admins.find((admin) => admin.email === email && admin.isActive);
  if (!target) return res.status(404).json({ error: { message: 'Active administrator account not found.' } });
  if (admins.filter((admin) => admin.isActive).length <= 1) return res.status(409).json({ error: { message: 'At least one active administrator email must remain.' } });
  const authUser = await findLocalUserByEmail(email);
  if (!authUser) {
    await removeAdminEmail(email);
    await audit(req, 'admin.user.unallow', email, email);
    return res.json({ success: true });
  }
  await removeAdminEmail(email);
  await revokeAdminRole(authUser.$id);
  await audit(req, 'admin.user.unallow', email, email);
  res.json({ success: true });
}));

adminRouter.post('/apis', asyncRoute(async (req, res) => {
  const parsed = ApiSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.apiKey) return res.status(400).json({ error: { message: parsed.success ? 'An API key is required.' : parsed.error.issues[0]?.message } });
  const id = `api_${randomUUID()}`;
  const now = new Date().toISOString();
  await repository('APIConfiguration').create(id, {
    name: parsed.data.name, baseUrl: parsed.data.baseUrl, apiKey: encryptAdminSecret(parsed.data.apiKey),
    provider: parsed.data.provider, isActive: parsed.data.isActive, priority: parsed.data.priority, createdAt: now, updatedAt: now,
  });
  await repository('APIQuota').create(randomUUID(), { apiId: id, quotaLimit: 0, quotaPeriod: 'monthly', quotaUsed: 0, resetDate: nextQuotaReset('monthly') });
  await applyEnabledModels();
  await audit(req, 'api.create', id, parsed.data.name);
  res.status(201).json({ id });
}));

adminRouter.put('/apis/:id', asyncRoute(async (req, res) => {
  const existing = await byId('APIConfiguration', req.params.id);
  if (!existing) return res.status(404).json({ error: { message: 'API configuration not found.' } });
  const parsed = ApiSchema.safeParse({ ...req.body, apiKey: req.body?.apiKey === '' ? undefined : req.body?.apiKey });
  if (!parsed.success) return res.status(400).json({ error: { message: parsed.error.issues[0]?.message } });
  const encryptedKey = parsed.data.apiKey === undefined ? String(existing.apiKey) : encryptAdminSecret(parsed.data.apiKey);
  await update('APIConfiguration', req.params.id, {
    name: parsed.data.name, baseUrl: parsed.data.baseUrl, apiKey: encryptedKey, provider: parsed.data.provider,
    isActive: parsed.data.isActive, priority: parsed.data.priority, updatedAt: new Date().toISOString(),
  });
  if (req.params.id === 'cleanapis-default') setRuntimeApiOverride(parsed.data.isActive ? decryptAdminSecret(encryptedKey) : '', parsed.data.baseUrl);
  await applyEnabledModels();
  await audit(req, 'api.update', req.params.id, parsed.data.name);
  res.json({ success: true });
}));

adminRouter.delete('/apis/:id', asyncRoute(async (req, res) => {
  if (!requireConfirmation(req, res)) return;
  const api = await byId('APIConfiguration', req.params.id);
  if (!api) return res.status(404).json({ error: { message: 'API configuration not found.' } });
  await remove('APIConfiguration', req.params.id);
  if (req.params.id === 'cleanapis-default') {
    await save('AdminSetting', 'cleanapisBuiltinDeleted', {
      value: 'true',
      updatedAt: new Date().toISOString(),
    });
    setRuntimeApiOverride('', String(api.baseUrl || 'https://cleanapis.com/v1/chat/completions'));
  }
  const remainingApis = (await all('APIConfiguration'))
    .sort((left, right) => number(left.priority) - number(right.priority) || String(left.name).localeCompare(String(right.name)));
  await Promise.all(remainingApis.map((remainingApi, index) =>
    update('APIConfiguration', String(remainingApi.id), { priority: index + 1, updatedAt: new Date().toISOString() })));
  await applyEnabledModels();
  await audit(req, 'api.delete', req.params.id, String(api.name || ''));
  res.json({ success: true });
}));

adminRouter.put('/apis-priority', asyncRoute(async (req, res) => {
  const parsed = z.object({ ids: z.array(z.string().min(1).max(120)).min(1).max(100) }).safeParse(req.body);
  if (!parsed.success || new Set(parsed.data.ids).size !== parsed.data.ids.length) return res.status(400).json({ error: { message: 'Provide a unique ordered list of API ids.' } });
  const configured = await all('APIConfiguration');
  if (configured.length !== parsed.data.ids.length || configured.some((row) => !parsed.data.ids.includes(String(row.id)))) {
    return res.status(400).json({ error: { message: 'Include every configured API exactly once in the priority order.' } });
  }
  const now = new Date().toISOString();
  for (const [index, id] of parsed.data.ids.entries()) await update('APIConfiguration', id, { priority: index + 1, updatedAt: now });
  await applyEnabledModels();
  await audit(req, 'api.priority.reorder', parsed.data.ids.join(','));
  res.json({ success: true });
}));

adminRouter.post('/apis/:id/test', asyncRoute(async (req, res) => {
  const api = await byId('APIConfiguration', req.params.id);
  if (!api) return res.status(404).json({ error: { message: 'API configuration not found.' } });
  let apiKey: string;
  try {
    apiKey = decryptAdminSecret(String(api.apiKey || ''));
  } catch {
    return res.status(500).json({ error: { message: 'The stored API key could not be decrypted. Check the server encryption configuration; the saved key was not changed.' } });
  }
  if (!apiKey) return res.status(400).json({ error: { message: 'This API connection has no stored key.' } });
  const endpoint = getChatCompletionsUrl(String(api.baseUrl));
  const started = Date.now();
  let status = 0;
  let message = 'API test failed.';
  try {
    const configuredModel = orderRows((await all('ModelConfig')).filter((row) => String(row.apiId) === req.params.id && isTrue(row.isEnabled)), 'name')[0];
    if (!configuredModel) {
      return res.status(409).json({ error: { message: 'No enabled model is linked to this API. Enable or sync a model before testing the connection.' } });
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: String(configuredModel.apiModelId || configuredModel.id),
        messages: [
          { role: 'system', content: CINTRA_IDENTITY_POLICY },
          { role: 'user', content: 'Reply with OK.' },
        ],
        max_tokens: 3,
      }),
      signal: AbortSignal.timeout(12000),
    });
    status = response.status;
    message = response.ok ? 'Connection and linked model test successful.' : providerHttpError(response.status, 'chat');
    await response.body?.cancel();
  } catch (error) {
    message = error instanceof Error ? error.message.slice(0, 200) : message;
  }
  const durationMs = Date.now() - started;
  await repository('ApiRequestLog').create(randomUUID(), {
    apiId: req.params.id, userId: null, endpoint: `admin:api-test:${req.params.id}`, method: 'POST',
    status, durationMs, createdAt: new Date().toISOString(),
  });
  await audit(req, 'api.test', req.params.id, `${status} ${durationMs}ms`);
  res.json({ success: status >= 200 && status < 400, status, durationMs, message });
}));

adminRouter.post('/apis/:id/sync-models', asyncRoute(async (req, res) => {
  const api = await byId('APIConfiguration', req.params.id);
  if (!api) return res.status(404).json({ error: { message: 'API configuration not found.' } });
  if (!isTrue(api.isActive)) return res.status(409).json({ error: { message: 'This API connection is inactive. Activate it before syncing models.' } });
  try {
    let apiKey: string;
    try {
      apiKey = decryptAdminSecret(String(api.apiKey || ''));
    } catch {
      return res.status(500).json({ error: { message: 'The stored API key could not be decrypted. Check the server encryption configuration; no models were changed.' } });
    }
    if (!apiKey) return res.status(400).json({ error: { message: 'This API connection has no stored key; no models were changed.' } });
    const modelsUrl = getModelsUrl(String(api.baseUrl));
    const response = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return res.status(502).json({ error: { message: providerHttpError(response.status, 'models') } });
    }
    const payload = await response.json() as { data?: Array<{ id?: string; name?: string }> };
    if (!Array.isArray(payload.data)) {
      return res.status(502).json({ error: { message: 'The provider returned an unsupported model-list response. Expected an OpenAI-compatible { data: [...] } response; no models were changed.' } });
    }
    const remoteModels = payload.data.slice(0, 500);
    const createdModelIds: string[] = [];
    await seedBuiltinModels();
    for (const remote of remoteModels) {
      const apiModelId = String(remote.id || '').trim().slice(0, 120);
      if (!apiModelId) continue;
      const id = api.id === 'cleanapis-default' ? apiModelId : `${String(api.id)}:${apiModelId.slice(0, 119 - String(api.id).length)}`;
      const existing = await byId('ModelConfig', id);
      if (existing) await update('ModelConfig', id, { name: String(remote.name || remote.id).slice(0, 120), apiModelId });
      else {
        await repository('ModelConfig').create(id, {
          name: String(remote.name || remote.id).slice(0, 120), apiId: String(api.id), apiModelId, costTier: 'medium', isEnabled: true, usageCount: 0,
        });
        createdModelIds.push(id);
      }
    }
    await autoLinkBayanOneModels(createdModelIds);
    await setSetting('modelsConfigured', 'true');
    await applyEnabledModels();
    await audit(req, 'api.models.sync', req.params.id, `${remoteModels.length} models`);
    res.json({ success: true, synchronized: remoteModels.length });
  } catch (error) {
    res.status(502).json({ error: { message: error instanceof Error ? error.message.slice(0, 200) : 'Could not sync provider models.' } });
  }
}));

adminRouter.get('/apis/:id/logs', asyncRoute(async (req, res) => {
  const logs = await all('ApiRequestLog', {
    filters: [{ field: 'apiId', op: '==', value: req.params.id }],
    orderBy: [{ field: 'createdAt', direction: 'desc' }],
    limit: 100,
  });
  res.json({ logs: logs.map(({ status, durationMs, createdAt }) => ({ status, durationMs, createdAt })) });
}));

adminRouter.get('/quota-status', asyncRoute(async (_req, res) => {
  await ensureQuotaRows();
  const quotas = await all('APIQuota');
  for (const quota of quotas) {
    if (dateValue(quota.resetDate) <= Date.now()) {
      await update('APIQuota', quota.id, { quotaUsed: 0, resetDate: nextQuotaReset(quota.quotaPeriod === 'daily' ? 'daily' : 'monthly') });
      quota.quotaUsed = 0;
      quota.resetDate = nextQuotaReset(quota.quotaPeriod === 'daily' ? 'daily' : 'monthly');
    }
  }
  const apis = await all('APIConfiguration');
  const apiById = new Map(apis.map((api) => [String(api.id), api]));
  const now = Date.now();
  const result = quotas.flatMap((quota) => {
    const api = apiById.get(String(quota.apiId));
    if (!api) return [];
    const limit = number(quota.quotaLimit);
    const resetAt = dateValue(quota.resetDate);
    const used = number(quota.quotaUsed);
    return [{
      apiId: api.id, name: api.name, priority: api.priority, isActive: api.isActive,
      quotaLimit: limit, quotaPeriod: quota.quotaPeriod, quotaUsed: used, resetDate: quota.resetDate, lastFailover: quota.lastFailover,
      remaining: limit > 0 ? Math.max(0, limit - used) : null,
      percentUsed: limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0,
      daysUntilReset: resetAt ? Math.max(0, Math.ceil((resetAt - now) / 86400000)) : null,
    }];
  });
  result.sort((a, b) => number(a.priority) - number(b.priority) || String(a.name).localeCompare(String(b.name)));
  res.json({ quotas: result });
}));

adminRouter.put('/quota-status/:apiId', asyncRoute(async (req, res) => {
  const parsed = z.object({ quotaLimit: z.number().int().min(0).max(100000000), quotaPeriod: z.enum(['daily', 'monthly']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: parsed.error.issues[0]?.message || 'Provide a valid quota.' } });
  if (!(await byId('APIConfiguration', req.params.apiId))) return res.status(404).json({ error: { message: 'API configuration not found.' } });
  const old = await quotaForApi(req.params.apiId);
  if (old) {
    const periodChanged = old.quotaPeriod !== parsed.data.quotaPeriod;
    await update('APIQuota', old.id, {
      quotaLimit: parsed.data.quotaLimit, quotaPeriod: parsed.data.quotaPeriod,
      quotaUsed: periodChanged ? 0 : number(old.quotaUsed),
      resetDate: periodChanged ? nextQuotaReset(parsed.data.quotaPeriod) : old.resetDate,
    });
  } else {
    await repository('APIQuota').create(randomUUID(), {
      apiId: req.params.apiId, quotaLimit: parsed.data.quotaLimit, quotaPeriod: parsed.data.quotaPeriod,
      quotaUsed: 0, resetDate: nextQuotaReset(parsed.data.quotaPeriod),
    });
  }
  await audit(req, 'api.quota.update', req.params.apiId, JSON.stringify(parsed.data));
  res.json({ success: true });
}));

adminRouter.post('/quota-reset', asyncRoute(async (req, res) => {
  const parsed = z.object({ apiId: z.string().min(1).max(120).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: 'Provide a valid API id.' } });
  if (!requireConfirmation(req, res)) return;
  await ensureQuotaRows();
  const quotas = await all('APIQuota');
  if (parsed.data.apiId && !quotas.some((row) => String(row.apiId) === parsed.data.apiId)) return res.status(404).json({ error: { message: 'API quota not found.' } });
  const targets = parsed.data.apiId ? quotas.filter((row) => String(row.apiId) === parsed.data.apiId) : quotas;
  for (const row of targets) await update('APIQuota', row.id, { quotaUsed: 0, resetDate: nextQuotaReset(row.quotaPeriod === 'daily' ? 'daily' : 'monthly') });
  await audit(req, 'api.quota.reset', parsed.data.apiId || 'all');
  res.json({ success: true });
}));

adminRouter.get('/failover-logs', asyncRoute(async (_req, res) => {
  const [logs, apis] = await Promise.all([all('APILog'), all('APIConfiguration')]);
  const apiById = new Map(apis.map((api) => [String(api.id), api]));
  const result = orderRows(logs.map((log) => ({
    ...log,
    requestedApiName: apiById.get(String(log.requestedApiId))?.name ?? null,
    selectedApiName: apiById.get(String(log.selectedApiId))?.name ?? null,
  })), 'createdAt', 'desc').slice(0, 500);
  res.json({ logs: result });
}));

adminRouter.get('/models', asyncRoute(async (_req, res) => {
  await seedBuiltinModels();
  await setSetting('modelsConfigured', 'true');
  const [models, apis, messages] = await Promise.all([all('ModelConfig'), all('APIConfiguration'), all('Message')]);
  const apiNames = new Map(apis.map((api) => [String(api.id), api.name]));
  const usage = new Map<string, number>();
  const tokens = new Map<string, number[]>();
  for (const message of messages) {
    if (message.role !== 'assistant' || message.model == null) continue;
    const id = String(message.model);
    usage.set(id, (usage.get(id) || 0) + 1);
    if (message.tokens != null) tokens.set(id, [...(tokens.get(id) || []), number(message.tokens)]);
  }
  await applyEnabledModels();
  res.json({ models: orderRows(models, 'name').map((model) => {
    const tokenList = tokens.get(String(model.id)) || [];
    const averageTokens = tokenList.length ? Math.round(tokenList.reduce((sum, value) => sum + value, 0) / tokenList.length) : 0;
    return {
      ...model,
      provider: apiNames.get(String(model.apiId)) ?? null,
      publicName: String(model.publicName || ''),
      publicId: String(model.publicId || ''),
      isPublic: isTrue(model.isPublic),
      isEnabled: isTrue(model.isEnabled),
      usageCount: usage.get(String(model.id)) || 0,
      averageTokens,
    };
  }) });
}));

adminRouter.post('/models/import', asyncRoute(async (req, res) => {
  const parsed = ImportedModelsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: parsed.error.issues[0]?.message || 'Provide a valid model list.' } });
  if (!(await byId('APIConfiguration', parsed.data.apiId))) return res.status(404).json({ error: { message: 'API configuration not found.' } });
  const createdModelIds: string[] = [];
  for (const model of parsed.data.models) {
    const id = parsed.data.apiId === 'cleanapis-default' ? model.id : `${parsed.data.apiId}:${model.id}`;
    const existing = await byId('ModelConfig', id);
    const values = { name: model.name, apiModelId: model.apiModelId || model.id, costTier: model.costTier || 'medium' };
    if (existing) await update('ModelConfig', id, values);
    else {
      await repository('ModelConfig').create(id, { ...values, apiId: parsed.data.apiId, isEnabled: true, usageCount: 0 });
      createdModelIds.push(id);
    }
  }
  await autoLinkBayanOneModels(createdModelIds);
  await setSetting('modelsConfigured', 'true');
  await applyEnabledModels();
  await audit(req, 'models.import', parsed.data.apiId, `${parsed.data.models.length} models`);
  res.status(201).json({ success: true, imported: parsed.data.models.length });
}));

adminRouter.put('/models/bulk', asyncRoute(async (req, res) => {
  const parsed = z.object({
    ids: z.array(z.string().min(1).max(120)).min(1).max(200),
    isEnabled: z.boolean().optional(), costTier: z.enum(['low', 'medium', 'high']).optional(),
  }).refine((body) => body.isEnabled !== undefined || body.costTier !== undefined).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: 'Choose models and a bulk update.' } });
  const values: Record<string, unknown> = {};
  if (parsed.data.isEnabled !== undefined) values.isEnabled = parsed.data.isEnabled;
  if (parsed.data.costTier) values.costTier = parsed.data.costTier;
  for (const id of parsed.data.ids) await update('ModelConfig', id, values);
  await applyEnabledModels();
  await audit(req, 'models.bulk.update', parsed.data.ids.join(','), JSON.stringify({ isEnabled: parsed.data.isEnabled, costTier: parsed.data.costTier }));
  res.json({ success: true });
}));

adminRouter.put('/models/:id', asyncRoute(async (req, res) => {
  const parsed = ModelUpdateSchema.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: { message: parsed.success ? 'Choose a model update.' : parsed.error.issues[0]?.message } });
  const model = await byId('ModelConfig', req.params.id);
  if (!model) return res.status(404).json({ error: { message: 'Model not found.' } });
  const values: Record<string, unknown> = { ...parsed.data };
  const nextPublicName = parsed.data.publicName ?? String(model.publicName || '');
  const willBePublic = parsed.data.isPublic ?? isTrue(model.isPublic);
  if (parsed.data.isPublic === true && !/^Cintra(?:\s|$)/i.test(nextPublicName)) {
    return res.status(400).json({ error: { message: 'Public model names must begin with Cintra.' } });
  }
  if (willBePublic && !/^Cintra(?:\s|$)/i.test(nextPublicName)) {
    return res.status(400).json({ error: { message: 'Set a public name beginning with Cintra before publishing this model.' } });
  }
  if (parsed.data.isPublic === true && !model.publicId) {
    values.publicId = `cintra-custom-${randomUUID()}`;
  }
  await update('ModelConfig', req.params.id, values);
  await applyEnabledModels();
  await audit(req, 'model.update', req.params.id, JSON.stringify(parsed.data));
  res.json({ success: true });
}));

adminRouter.delete('/models/:id', asyncRoute(async (req, res) => {
  if (!requireConfirmation(req, res)) return;
  if (!(await remove('ModelConfig', req.params.id))) return res.status(404).json({ error: { message: 'Model not found.' } });
  await applyEnabledModels();
  await audit(req, 'model.delete', req.params.id);
  res.json({ success: true });
}));

adminRouter.get('/models/:id/usage', asyncRoute(async (req, res) => {
  const usage = (await all('UsageLog')).filter((row) => String(row.model) === req.params.id);
  const grouped = new Map<string, number>();
  for (const row of usage) grouped.set(datePart(row.date), (grouped.get(datePart(row.date)) || 0) + number(row.count));
  const result = [...grouped].map(([date, count]) => ({ date, count })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 90);
  res.json({ usage: result });
}));

adminRouter.get('/settings', asyncRoute(async (_req, res) => {
  const rows = await all('AdminSetting');
  const values = Object.fromEntries(rows.map((row) => [String(row.key), String(row.value)]));
  res.json({ settings: {
    dailyMessageLimit: Number(values.dailyMessageLimit || 50), maxUploadSizeMb: Number(values.maxUploadSizeMb || 10),
    studyModeEnabled: values.studyModeEnabled !== 'false', guestLoginEnabled: values.guestLoginEnabled !== 'false',
    highTierCredits: Number(values.highTierCredits || 10), mediumTierCredits: Number(values.mediumTierCredits || 5),
    lowTierCredits: Number(values.lowTierCredits || 1), proPlanPrice: Number(values.proPlanPrice || 0),
    logRetentionDays: Number(values.logRetentionDays || 90), ipWhitelist: values.ipWhitelist || '',
    imageModel: values.imageModel || process.env.CLEANAPIS_IMAGE_MODEL?.trim() || 'cf/black-forest-labs/flux-1-schnell',
  } });
}));

adminRouter.put('/settings', asyncRoute(async (req, res) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: parsed.error.issues[0]?.message || 'Invalid settings.' } });
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(parsed.data)) await setSetting(key, String(value), now);
  const cutoff = Date.now() - parsed.data.logRetentionDays * 86400000;
  for (const [collection, field] of [
    ['ApiRequestLog', 'createdAt'], ['UserEventLog', 'createdAt'], ['SystemLog', 'createdAt'], ['AdminLog', 'timestamp'],
  ] as const) await removeWhere(collection, (row) => dateValue(row[field]) > 0 && dateValue(row[field]) < cutoff);
  await audit(req, 'settings.update', 'system', JSON.stringify(parsed.data));
  res.json({ success: true, settings: parsed.data });
}));

adminRouter.put('/settings/admin-key', asyncRoute(async (req, res) => {
  const parsed = z.object({ currentKey: z.string().min(1).max(512), newKey: z.string().min(32).max(512) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: parsed.error.issues[0]?.message || 'Enter a new key with at least 32 characters.' } });
  if (!verifyAdminAccessKey(parsed.data.currentKey)) return res.status(403).json({ error: { message: 'Current admin key is incorrect.' } });
  await setSetting('encryptedAdminAccessKey', encryptAdminSecret(parsed.data.newKey));
  setRuntimeAdminAccessKey(parsed.data.newKey);
  await audit(req, 'security.admin-key.rotate', 'zeyad');
  res.json({ success: true });
}));

adminRouter.get('/sessions', asyncRoute(async (_req, res) => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const requests = await all('ApiRequestLog', {
    filters: [{ field: 'createdAt', op: '>=', value: new Date(cutoff).toISOString() }],
  });
  const userIds = [...new Set(requests.map((request) => String(request.userId)).filter(Boolean))];
  const users: Row[] = [];
  for (let offset = 0; offset < userIds.length; offset += 30) {
    users.push(...await all('User', {
      filters: [{ field: 'id', op: 'in', value: userIds.slice(offset, offset + 30) }],
    }));
  }
  const userById = new Map(users.map((user) => [String(user.id), user]));
  const grouped = new Map<string, Row[]>();
  for (const request of requests) {
    if (request.userId == null || dateValue(request.createdAt) < cutoff) continue;
    const key = String(request.userId);
    grouped.set(key, [...(grouped.get(key) || []), request]);
  }
  const sessions = [...grouped].map(([userId, rows]) => {
    const user = userById.get(userId);
    return {
      userId, name: user?.name ?? null, email: user?.email ?? null,
      lastActivity: rows.map((row) => row.createdAt).sort((a, b) => dateValue(b) - dateValue(a))[0],
      requestCount: rows.length,
    };
  }).sort((a, b) => dateValue(b.lastActivity) - dateValue(a.lastActivity)).slice(0, 100);
  res.json({ sessions });
}));

adminRouter.get('/logs', asyncRoute(async (req, res) => {
  const type = ['api', 'system', 'user', 'admin'].includes(String(req.query.type)) ? String(req.query.type) : 'api';
  const search = String(req.query.search || '').trim().slice(0, 120);
  const status = Number.parseInt(String(req.query.status || ''), 10);
  const from = String(req.query.from || '').slice(0, 10);
  const to = String(req.query.to || '').slice(0, 10);
  const inRange = (row: Row, field: string) => (!from || datePart(row[field]) >= from) && (!to || datePart(row[field]) <= to);
  const toExclusive = to ? new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString() : '';
  const timestampFilters = (field: string): DataFilter[] => [
    ...(from ? [{ field, op: '>=' as const, value: `${from}T00:00:00.000Z` }] : []),
    ...(to ? [{ field, op: '<' as const, value: toExclusive }] : []),
  ];
  if (type === 'api') {
    const filters = timestampFilters('createdAt');
    if (Number.isFinite(status)) filters.push({ field: 'status', op: '==', value: status });
    const [rows, users] = await Promise.all(search
      ? [all('ApiRequestLog'), all('User')]
      : [
          all('ApiRequestLog', { filters, orderBy: [{ field: 'createdAt', direction: 'desc' }], limit: 200 }),
          Promise.resolve([]),
        ]);
    if (!search) {
      const userIds = [...new Set(rows.map((row) => String(row.userId)).filter(Boolean))];
      for (let offset = 0; offset < userIds.length; offset += 30) {
        users.push(...await all('User', {
          filters: [{ field: 'id', op: 'in', value: userIds.slice(offset, offset + 30) }],
        }));
      }
    }
    const userById = new Map(users.map((user) => [String(user.id), user]));
    const logs = rows.filter((row) =>
      (!search || like(row.endpoint, `%${search}%`) || like(row.method, `%${search}%`) || like(row.status, `%${search}%`))
      && (!Number.isFinite(status) || number(row.status) === status) && inRange(row, 'createdAt'))
      .map((row) => ({ ...row, userName: userById.get(String(row.userId))?.name ?? null, userEmail: userById.get(String(row.userId))?.email ?? null }));
    return res.json({ type, logs: orderRows(logs, 'createdAt', 'desc').slice(0, 200) });
  }
  if (type === 'user') {
    const filters = timestampFilters('createdAt');
    const [rows, users] = await Promise.all(search
      ? [all('UserEventLog'), all('User')]
      : [
          all('UserEventLog', { filters, orderBy: [{ field: 'createdAt', direction: 'desc' }], limit: 200 }),
          Promise.resolve([]),
        ]);
    if (!search) {
      const userIds = [...new Set(rows.map((row) => String(row.userId)).filter(Boolean))];
      for (let offset = 0; offset < userIds.length; offset += 30) {
        users.push(...await all('User', {
          filters: [{ field: 'id', op: 'in', value: userIds.slice(offset, offset + 30) }],
        }));
      }
    }
    const userById = new Map(users.map((user) => [String(user.id), user]));
    const logs = rows.filter((row) =>
      (!search || like(row.event, `%${search}%`) || like(row.details, `%${search}%`) || like(row.userId, `%${search}%`))
      && inRange(row, 'createdAt'))
      .map((row) => ({ ...row, userName: userById.get(String(row.userId))?.name ?? null, userEmail: userById.get(String(row.userId))?.email ?? null }));
    return res.json({ type, logs: orderRows(logs, 'createdAt', 'desc').slice(0, 200) });
  }
  if (type === 'admin') {
    const logs = (search
      ? await all('AdminLog')
      : await all('AdminLog', {
          filters: timestampFilters('timestamp'),
          orderBy: [{ field: 'timestamp', direction: 'desc' }],
          limit: 200,
        })).filter((row) =>
          (!search || like(row.action, `%${search}%`) || like(row.target, `%${search}%`) || like(row.details, `%${search}%`))
          && inRange(row, 'timestamp'));
    return res.json({ type, logs: orderRows(logs, 'timestamp', 'desc').slice(0, 200) });
  }
  const logs = (search
    ? await all('SystemLog')
    : await all('SystemLog', {
        filters: timestampFilters('createdAt'),
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 200,
      })).filter((row) => (!search || like(row.message, `%${search}%`)) && inRange(row, 'createdAt'));
  res.json({ type, logs: orderRows(logs, 'createdAt', 'desc').slice(0, 200) });
}));

adminRouter.get('/database/stats', asyncRoute(async (_req, res) => {
  const collections: DataCollection[] = [
    'User', 'UsageLog', 'Conversation', 'Message', 'MessageAudio', 'Attachment', 'Feedback', 'StudyNote',
    'StudyArtifact', 'PDFDocument', 'PDFOperation', 'Agent', 'AgentAction', 'AgentApproval', 'Subscription',
    'Payment', 'ProcessedStripeEvent', 'PendingUpload', 'SharedLink', 'APIConfiguration', 'APIQuota',
    'APIQuotaUsage', 'APILog', 'ModelConfig', 'AdminLog', 'AdminSetting', 'ApiRequestLog', 'UserEventLog',
    'SystemLog', 'BackupLog', 'Account', 'Session', 'PasswordReset', 'AdminUser', 'AdminSession', 'AdminAllowlist',
  ];
  const tables = await Promise.all(collections.map(async (collection) => {
    const [rowCount, sample] = await Promise.all([count(collection), all(collection, { limit: 10 })]);
    const averageBytes = sample.length
      ? sample.reduce((total, row) => total + Buffer.byteLength(JSON.stringify(row)), 0) / sample.length
      : 0;
    return {
      name: collection, rowCount,
      estimatedBytes: Math.round(averageBytes * rowCount),
    };
  }));
  tables.sort((a, b) => a.name.localeCompare(b.name));
  const databaseBytes = tables.reduce((sum, table) => sum + table.estimatedBytes, 0);
  const fileBytes = await localStorageUsageBytes();
  res.json({
    tables, databaseBytes, databaseMb: Number((databaseBytes / 1024 / 1024).toFixed(2)),
    storageBytes: fileBytes, storageAvailable: fileBytes !== null,
    connectionCount: 0, lastBackup: null, backupProvider: 'Persistent server disk',
  });
}));

adminRouter.get('/attachments/:id', asyncRoute(async (req, res) => {
  const attachment = await byId('Attachment', req.params.id);
  if (!attachment) return res.status(404).json({ error: { message: 'Attachment not found.' } });
  const file = await downloadLocalFile(String(attachment.fileUrl || ''));
  if (!file) return res.status(404).json({ error: { message: 'Attachment file is unavailable.' } });
  const fileName = path.basename(String(attachment.fileName || 'attachment'))
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '_')
    .slice(0, 200) || 'attachment';
  res.type(file.contentType).attachment(fileName).send(file.contents);
}));

adminRouter.get('/database/backups', asyncRoute(async (_req, res) => {
  res.json({ backups: [], backupProvider: 'Persistent server disk' });
}));

adminRouter.post('/database/backup', asyncRoute(async (_req, res) => {
  res.status(501).json({ error: { message: 'Configure database snapshots with the hosting provider.' } });
}));

adminRouter.get('/database/backups/:id/download', asyncRoute(async (_req, res) => {
  res.status(501).json({ error: { message: 'Database snapshots are managed by the hosting provider.' } });
}));

adminRouter.post('/database/restore', asyncRoute(async (_req, res) => {
  res.status(501).json({ error: { message: 'Restore database snapshots through the hosting provider.' } });
}));

adminRouter.post('/database/cleanup', asyncRoute(async (req, res) => {
  if (!requireConfirmation(req, res)) return;
  const cutoff = Date.now() - 90 * 86400000;
  const oldMessages = (await all('Message')).filter((row) => dateValue(row.createdAt) > 0 && dateValue(row.createdAt) < cutoff);
  const messageIds = new Set(oldMessages.map((row) => String(row.id)));
  const files = (await all('Attachment')).filter((row) => messageIds.has(String(row.messageId)));
  for (const collection of ['Feedback', 'StudyNote', 'StudyArtifact', 'Attachment'] as const) {
    await removeWhere(collection, (row) => messageIds.has(String(row.messageId)));
  }
  const removed = await removeWhere('Message', (row) => messageIds.has(String(row.id)));
  for (const file of files) if (file.fileUrl) await removeUpload(String(file.fileUrl));
  await audit(req, 'database.cleanup', 'messages', String(removed));
  res.json({ success: true, deletedMessages: removed });
}));

export async function initializeAdminRuntimeConfig(): Promise<void> {
  const savedImageModel = await setting('imageModel', '');
  if (!savedImageModel || ['@cf/black-forest-labs/flux-2-klein-4b', 'flux-2-klein-4b'].includes(savedImageModel)) {
    await setSetting('imageModel', process.env.CLEANAPIS_IMAGE_MODEL?.trim() || 'cf/black-forest-labs/flux-1-schnell');
  }
  const bootstrapEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const bootstrapAlreadyCompleted = (await setting('adminBootstrapSeeded', '0')) === '1';
  if (bootstrapEmail || bootstrapPassword) {
    if (!bootstrapEmail || !bootstrapPassword) {
      console.error('Admin seed skipped: configure both ADMIN_EMAIL and ADMIN_BOOTSTRAP_PASSWORD.');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail)) {
      console.error('Admin seed skipped: ADMIN_EMAIL must be a valid email address.');
    } else if (bootstrapPassword.length < 12 || bootstrapPassword.length > 100 || Buffer.byteLength(bootstrapPassword, 'utf8') > 72) {
      console.error('Admin seed skipped: ADMIN_BOOTSTRAP_PASSWORD must be between 12 and 100 characters and no more than 72 UTF-8 bytes.');
    } else {
      const existingBootstrapUser = await findLocalUserByEmail(bootstrapEmail);
      if (existingBootstrapUser) {
        const existingProfile = await userRepo.findByAuthId(existingBootstrapUser.$id);
        if (existingProfile?.role === 'admin') {
          const configuredFingerprint = await setting('adminBootstrapPasswordFingerprint', '');
          const passwordChanged = !configuredFingerprint
            || !matchesPasswordFingerprint(bootstrapPassword, configuredFingerprint);
          if (passwordChanged) {
            await updateLocalAccountCredentials(existingBootstrapUser.$id, { password: bootstrapPassword });
            await setSetting('adminBootstrapPasswordFingerprint', createPasswordFingerprint(bootstrapPassword));
            console.info('Admin bootstrap password synchronized for the configured existing admin account.');
          }
          if (!await isAdminEmailAllowed(bootstrapEmail)) {
            await addAdminEmail(bootstrapEmail, 'environment-bootstrap');
          }
          await setSetting('adminBootstrapSeeded', '1');
        } else if (!bootstrapAlreadyCompleted) {
          console.warn('Admin bootstrap skipped because ADMIN_EMAIL already belongs to a non-admin account; use the trusted admin:grant command after confirming account ownership.');
        } else {
          console.warn('Admin bootstrap could not update the configured email because it is not an existing admin account.');
        }
      } else if (bootstrapAlreadyCompleted) {
        console.warn('Admin bootstrap did not create an account because setup was already completed; verify ADMIN_EMAIL matches the existing admin account.');
      } else {
        const seededAdmin = await createEmailPasswordAccount({
          email: bootstrapEmail,
          password: bootstrapPassword,
          name: 'Cintra Admin',
        });
        try {
          await grantAdminRole(seededAdmin.user.id);
          if (!await isAdminEmailAllowed(bootstrapEmail)) {
            await addAdminEmail(bootstrapEmail, 'environment-bootstrap');
          }
          await setSetting('adminBootstrapPasswordFingerprint', createPasswordFingerprint(bootstrapPassword));
          await setSetting('adminBootstrapSeeded', '1');
        } finally {
          await signOutSession(seededAdmin.sessionSecret);
        }
      }
    }
  }
  if ((process.env.ADMIN_SESSION_SECRET || '').trim().length >= 32 && getCleanApisConfig().apiKey) await seedBuiltinModels();
  const encryptedAdminKey = await setting('encryptedAdminAccessKey', '');
  if (encryptedAdminKey) {
    try { setRuntimeAdminAccessKey(decryptAdminSecret(encryptedAdminKey)); }
    catch (error) { console.error('Stored admin key could not be decrypted:', error); }
  }
  const api = await byId('APIConfiguration', 'cleanapis-default');
  if (api) {
    try {
      setRuntimeApiOverride(isTrue(api.isActive) ? decryptAdminSecret(String(api.apiKey || '')) : '', String(api.baseUrl));
    } catch (error) {
      console.error('Stored cleanapis configuration could not be decrypted:', error);
    }
  } else if (await setting('cleanapisBuiltinDeleted', 'false') === 'true') {
    setRuntimeApiOverride('', process.env.CLEANAPIS_BASE_URL || 'https://cleanapis.com/v1/chat/completions');
  }
  await applyEnabledModels();
}
