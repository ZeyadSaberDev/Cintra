import { randomUUID } from 'node:crypto';
import { LocalRepository, runLocalTransaction } from '../db/repository.js';
import { getChatCompletionsUrl } from './endpoints.js';
import { runProviderDiagnostics } from './providerDiagnostics.js';
import { getModelCost, type ModelCostTier } from '../config/modelCosts.js';
import type { ServiceApiCapability, ServiceApiRoutes } from './serviceApiRoutes.js';
import { BAYAN_ONE_MODEL_ID, BAYAN_ONE_MODEL_NAME, resolveBayanOneRoutes, shouldFallbackBayanOne, type BayanOneConfig } from './bayanOne.js';
import { AUTO_CINTRA_ROUTE_PREFIX, CINTRA_IDENTITY_POLICY, CINTRA_MODELS, isCintraModelId, resolveCintraFusionModel, resolveCintraModelId, resolveCintraRouteCandidates, type CintraModelId, type CintraModelRoutes } from './cintraModels.js';

/**
 * cleanapis.com AI Provider Adapter
 * 
 * Single point of contact for AI generation. Called from server only.
 * Supports OpenAI-compatible streaming SSE, abortion, and multi-model configuration.
 */

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ChatContentPart[];
}

export function imageContentPart(mimeType: string, bytes: Uint8Array): ChatContentPart {
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }
  if (!bytes.byteLength) {
    throw new Error('Cannot create image content from an empty file.');
  }
  return {
    type: 'image_url',
    image_url: { url: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}` },
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'Bayan AI' | 'Cintra' | 'Claude' | 'OpenAI' | 'DeepSeek' | 'Google Gemini' | 'Qwen' | 'Kimi' | 'Other';
  group?: string;
  description?: string;
  badge?: string;
  costTier?: ModelCostTier;
}

type RuntimeModelRoute = {
  id: string;
  name: string;
  publicName?: string;
  publicId?: string;
  isPublic?: boolean;
  apiId: string;
  apiModelId: string;
  provider: string;
  isEnabled: boolean;
  costTier?: string;
};
type RuntimeApiProvider = {
  id: string;
  apiKey: string;
  baseUrl: string;
  isActive: boolean;
  priority: number;
};

function normalizeCostTier(value?: string): ModelCostTier | undefined {
  const normalized = value?.toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'low') return 'Low';
  return undefined;
}

let runtimeApiOverride: { apiKey: string; baseUrl: string } | null = null;
let runtimeEnabledModels: string[] | null = null;
let runtimeProviders: RuntimeApiProvider[] | null = null;
let runtimeModels: RuntimeModelRoute[] | null = null;
let runtimeBayanOneConfig: BayanOneConfig = { active: false, modelIds: [], autoLinkNewApis: false };
let runtimeCintraModelRoutes: CintraModelRoutes | null = null;
let runtimeServiceApiRoutes: ServiceApiRoutes | null = null;

export function setRuntimeApiOverride(apiKey: string, baseUrl: string): void {
  runtimeApiOverride = { apiKey, baseUrl };
}

export function setRuntimeEnabledModels(modelIds: string[] | null): void {
  runtimeEnabledModels = modelIds;
}

export function setRuntimeProviderRouting(
  providers: RuntimeApiProvider[],
  models: RuntimeModelRoute[],
): void {
  runtimeProviders = providers;
  runtimeModels = models;
}

export function getPublicModelCatalog(): ModelInfo[] {
  const customModels = (runtimeModels || [])
    .filter((model) => model.isEnabled && model.isPublic && model.publicId && model.publicName)
    .filter((model) => runtimeProviders?.some((provider) => (
      provider.id === model.apiId && provider.isActive && provider.apiKey.trim()
    )))
    .map((model) => {
      const costTier = normalizeCostTier(model.costTier);
      return {
        id: String(model.publicId),
        name: String(model.publicName),
        provider: 'Cintra' as const,
        group: 'Cintra',
        description: 'Cintra model',
        ...(costTier ? { costTier } : {}),
      };
    });
  return [
    ...CINTRA_MODELS.map(({ id, name, description }) => ({
      id,
      name,
      description,
      provider: 'Cintra' as const,
      group: 'Cintra',
      costTier: getModelCost(id).tier,
    })),
    ...customModels,
  ];
}

export function isPublicModelId(modelId: string): boolean {
  return isCintraModelId(modelId) || Boolean(
    runtimeModels?.some((model) => (
      model.publicId === modelId
      && model.publicName
      && model.isPublic
      && model.isEnabled
      && runtimeProviders?.some((provider) => provider.id === model.apiId && provider.isActive && provider.apiKey.trim())
    )),
  );
}

export function setRuntimeServiceApiRoutes(routes: ServiceApiRoutes): void {
  runtimeServiceApiRoutes = { ...routes };
}

export function getRuntimeServiceProvider(
  capability: ServiceApiCapability,
): { apiKey: string; baseUrl: string; providerId: string } | null {
  const providers = [...(runtimeProviders || [])]
    .filter((item) => item.isActive && item.apiKey.trim())
    .sort((left, right) => left.priority - right.priority);
  const selectedId = runtimeServiceApiRoutes?.[capability];
  const provider = selectedId
    ? providers.find((item) => item.id === selectedId)
    : providers[0];
  if (selectedId && !provider) return null;
  if (provider) return { apiKey: provider.apiKey, baseUrl: provider.baseUrl, providerId: provider.id };
  const config = getCleanApisConfig();
  return !selectedId && config.apiKey
    ? { apiKey: config.apiKey, baseUrl: config.baseUrl, providerId: 'environment' }
    : null;
}

export function getRuntimeImageProvider(): { apiKey: string; baseUrl: string } | null {
  const provider = getRuntimeServiceProvider('image');
  return provider ? { apiKey: provider.apiKey, baseUrl: provider.baseUrl } : null;
}

export function getRuntimeSearchProvider(): { apiKey: string; baseUrl: string; providerId: string } | null {
  if (runtimeServiceApiRoutes?.search) return getRuntimeServiceProvider('search');
  if (runtimeApiOverride?.apiKey.trim()) {
    return { ...runtimeApiOverride, providerId: 'configured' };
  }
  return getRuntimeServiceProvider('search');
}

export function getRuntimeModelCostTier(modelId: string): string | null {
  if (!runtimeModels) return null;
  const publicModel = runtimeModels.find((model) => model.publicId === modelId && model.isPublic && model.isEnabled);
  if (publicModel) return publicModel.costTier || '';
  const assignedRouteId = isCintraModelId(modelId)
    ? getConfiguredRouteCandidates(modelId)[0]?.route.id
    : undefined;
  const resolvedModelId = resolveCintraModelId(
    assignedRouteId || modelId,
    runtimeModels.map(({ id, name }) => ({ id, name })),
    getCleanApisConfig().defaultModel,
  );
  const model = runtimeModels.find((item) => item.id === resolvedModelId);
  return model ? model.costTier || '' : null;
}

export function setRuntimeBayanOneConfig(config: BayanOneConfig): void {
  runtimeBayanOneConfig = { ...config, modelIds: [...new Set(config.modelIds)] };
}

export function setRuntimeCintraModelRoutes(routes: CintraModelRoutes): void {
  runtimeCintraModelRoutes = {
    'cintra-core-v1': [...new Set(routes['cintra-core-v1'])],
    'cintra-research': [...new Set(routes['cintra-research'])],
    'cintra-creative': [...new Set(routes['cintra-creative'])],
    'cintra-analyst': [...new Set(routes['cintra-analyst'])],
  };
}

function getConfiguredRouteCandidates(modelId: CintraModelId): Array<{
  route: RuntimeModelRoute | {
    id: string;
    name: 'Auto';
    apiId: string;
    apiModelId: 'auto';
    isEnabled: true;
  };
  provider: RuntimeApiProvider;
}> {
  if (!runtimeCintraModelRoutes) return [];
  return resolveCintraRouteCandidates(modelId, runtimeCintraModelRoutes, runtimeModels || [], runtimeProviders || []);
}

export function getCleanApisConfig() {
  const apiKey = runtimeApiOverride?.apiKey.trim()
    ? runtimeApiOverride.apiKey
    : process.env.FREELLMAPI_API_KEY?.trim()
      || process.env.CLEANAPIS_API_KEY?.trim()
      || '';
  const configuredBaseUrl = (
    runtimeApiOverride?.apiKey.trim()
      ? runtimeApiOverride.baseUrl
      : process.env.FREELLMAPI_BASE_URL
        || process.env.CLEANAPIS_BASE_URL
        || 'https://freellmapi-zeyad.up.railway.app/v1'
  ).trim().replace(/\/+$/, '');
  const baseUrl = /\/chat\/completions$/i.test(configuredBaseUrl)
    ? configuredBaseUrl
    : `${configuredBaseUrl}${/\/v1$/i.test(configuredBaseUrl) ? '' : '/v1'}/chat/completions`;
  const configuredDefault = (
    process.env.FREELLMAPI_DEFAULT_MODEL
    || process.env.CLEANAPIS_DEFAULT_MODEL
    || 'auto'
  )
    .replace(/^(?:FREELLMAPI|CLEANAPIS)_DEFAULT_MODEL\s*=\s*"?/i, '')
    .replace(/"?$/, '')
    .trim();
  let modelsRaw = process.env.FREELLMAPI_MODELS || process.env.CLEANAPIS_MODELS ||
    'claude-opus-5.5,gpt-5.6-luna,gemma-2-2b,deepseek-v4-flash-0731,deepseek-v4-pro-0813,qwen3.8-27b,seed-2.1-turbo,seed-2.1-pro,kimi-k2.6,gemini-3.7-flash,glm-5.3,glm-5.2,qwen3.8-max,qwen3.7-max,muse-spark-1.1,deepseek-v4-pro-max,gemini-3.6-flash,grok-4.5,grok-4.6,claude-sonnet-5,gpt-5.6-terra,gemini-3.1-pro,kimi-k3,claude-opus-5,claude-mythos-preview,claude-opus-4.8,claude-opus-4.6,claude-opus-4.7,gpt-5.6-sol,gpt-5.5,gpt-5.5-pro,claude-fable-5,claude-fable-5.1';
  modelsRaw = modelsRaw.replace(/^(?:FREELLMAPI|CLEANAPIS)_MODELS\s*=\s*"?/i, '').replace(/"?$/, '');

  const modelIds = (runtimeEnabledModels ?? modelsRaw.split(','))
    .map((m) => m.trim().replace(/^"/, '').replace(/"$/, ''))
    .filter(Boolean);

  const mapProvider = (id: string, configuredProvider = ''): ModelInfo['provider'] => {
    const providerName = configuredProvider.toLowerCase();
    if (providerName.includes('claude') || id.startsWith('claude')) return 'Claude';
    if (providerName.includes('google') || providerName.includes('gemini') || id.startsWith('gemini') || id.startsWith('gemma')) return 'Google Gemini';
    if (providerName.includes('openai') || id.startsWith('gpt')) return 'OpenAI';
    if (id.startsWith('deepseek')) return 'DeepSeek';
    if (id.startsWith('qwen')) return 'Qwen';
    if (id.startsWith('kimi')) return 'Kimi';
    return 'Other';
  };

  const models: ModelInfo[] = runtimeModels
    ? runtimeModels.filter((model) => model.isEnabled && runtimeProviders?.some((provider) => provider.id === model.apiId && provider.isActive))
      .map((model) => ({ id: model.id, name: model.name, provider: mapProvider(model.apiModelId, model.provider) }))
    : modelIds.map((id) => {
    let provider: ModelInfo['provider'] = 'Other';
    let name = id;

    if (id.startsWith('claude')) {
      provider = 'Claude';
      name = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    } else if (id.startsWith('gpt')) {
      provider = 'OpenAI';
      name = id.toUpperCase().replace('-', ' ');
    } else if (id.startsWith('deepseek')) {
      provider = 'DeepSeek';
      name = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    } else if (id.startsWith('gemini') || id.startsWith('gemma')) {
      provider = 'Google Gemini';
      name = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    } else if (id.startsWith('qwen')) {
      provider = 'Qwen';
      name = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    } else if (id.startsWith('kimi')) {
      provider = 'Kimi';
      name = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    } else if (id.startsWith('grok')) {
      provider = 'Other';
      name = id.toUpperCase();
    }

    return {
      id,
      name,
      provider,
    };
  });
  const bayanOneRoutes = runtimeProviders && runtimeModels
    ? resolveBayanOneRoutes(runtimeBayanOneConfig, runtimeProviders, runtimeModels)
    : [];
  if (runtimeBayanOneConfig.active) models.unshift({ id: BAYAN_ONE_MODEL_ID, name: BAYAN_ONE_MODEL_NAME, provider: 'Bayan AI' });
  const defaultModel = runtimeBayanOneConfig.active
    ? BAYAN_ONE_MODEL_ID
    : models.some((model) => model.id === configuredDefault) ? configuredDefault : models[0]?.id || configuredDefault;

  return {
    apiKey,
    baseUrl,
    defaultModel,
    models,
  };
}

function nextQuotaReset(period: 'daily' | 'monthly'): string {
  const reset = new Date();
  if (period === 'daily') reset.setUTCDate(reset.getUTCDate() + 1);
  else reset.setUTCMonth(reset.getUTCMonth() + 1);
  return reset.toISOString();
}

type ProviderQuota = {
  id: string;
  apiId: string;
  quotaLimit: number;
  quotaPeriod: 'daily' | 'monthly';
  quotaUsed: number;
  resetDate: string;
  lastFailover?: string | null;
};

const apiQuotas = new LocalRepository<ProviderQuota>('APIQuota');
const apiLogs = new LocalRepository<{ id: string; [key: string]: unknown }>('APILog');

async function getProviderQuota(apiId: string): Promise<ProviderQuota | null> {
  const rows = await apiQuotas.list({ filters: [{ field: 'apiId', op: '==', value: apiId }], limit: 2 });
  if (rows.length > 1) throw new Error(`Multiple API quota documents exist for provider ${apiId}.`);
  return rows[0] || null;
}

async function recordProviderAcceptance(apiId: string, usageDate: string): Promise<void> {
  const usageId = `${apiId}_${usageDate}`;
  await runLocalTransaction(async (transaction) => {
    const [quotaRows, usage] = await Promise.all([
      transaction.list<ProviderQuota>('apiQuotas', { filters: [{ field: 'apiId', op: '==', value: apiId }], limit: 2 }),
      transaction.get<{ id: string; usageCount?: number }>('apiQuotaUsage', usageId),
    ]);
    if (quotaRows.length > 1) {
      throw new Error(`Multiple API quota documents exist for provider ${apiId}.`);
    }
    const quota = quotaRows[0];
    if (quota) {
      await transaction.update('apiQuotas', quota.id, { quotaUsed: Number(quota.quotaUsed || 0) + 1 });
    } else {
      await transaction.create('apiQuotas', `quota_${apiId}`, {
        apiId,
        quotaLimit: 0,
        quotaPeriod: 'monthly',
        quotaUsed: 1,
        resetDate: nextQuotaReset('monthly'),
      });
    }
    if (usage) {
      await transaction.update('apiQuotaUsage', usageId, { usageCount: Number(usage.usageCount || 0) + 1 });
    } else {
      await transaction.create('apiQuotaUsage', usageId, { apiId, usageDate, usageCount: 1 });
    }
  });
}

async function updateProviderFailover(apiId: string, at: string): Promise<void> {
  const quota = await getProviderQuota(apiId);
  if (quota) await apiQuotas.update(quota.id, { lastFailover: at });
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onError: (error: { code: string; message: string; messageAr: string }) => void;
  onFinish: (fullContent: string) => void | Promise<void>;
}

type ProviderFailure = { code: string; message: string; messageAr: string };

/**
 * Initiates a streaming chat completion with cleanapis.com
 */
export async function streamChatCompletion({
  messages,
  model,
  signal,
  callbacks,
  customInstructions,
  thinkingMode = false,
  providerOverrideId,
  onProviderAccepted,
  upstreamModelOverride,
}: {
  messages: ChatMessage[];
  model?: string;
  signal?: AbortSignal;
  callbacks: StreamCallbacks;
  customInstructions?: string | null;
  thinkingMode?: boolean;
  providerOverrideId?: string;
  onProviderAccepted?: (apiId: string) => Promise<void> | void;
  upstreamModelOverride?: string;
}): Promise<void> {
  const config = getCleanApisConfig();
  const requestedModel = model || config.defaultModel;
  const publicModelId = isCintraModelId(requestedModel) ? requestedModel : null;
  const customPublicModel = publicModelId ? null : runtimeModels?.find((item) => (
    item.publicId === requestedModel
    && item.isPublic
    && item.isEnabled
    && runtimeProviders?.some((provider) => provider.id === item.apiId && provider.isActive && provider.apiKey.trim())
  ));
  const configuredUpstreamModel = upstreamModelOverride
    || (publicModelId ? resolveCintraFusionModel(publicModelId, config.defaultModel) || undefined : undefined);
  const configuredRouteIds = publicModelId ? runtimeCintraModelRoutes?.[publicModelId] : undefined;
  const configuredCandidates = publicModelId ? getConfiguredRouteCandidates(publicModelId) : [];
  const firstConfiguredRouteId = configuredCandidates[0]?.route.id;
  const selectedModel = customPublicModel?.id || (
    firstConfiguredRouteId && !firstConfiguredRouteId.startsWith(AUTO_CINTRA_ROUTE_PREFIX)
      ? firstConfiguredRouteId
      : publicModelId || resolveCintraModelId(requestedModel, config.models, config.defaultModel)
  );
  const modelRoute = runtimeModels?.find((item) => item.id === selectedModel && item.isEnabled);
  const primaryProvider = modelRoute
    ? runtimeProviders?.find((provider) => provider.id === modelRoute.apiId && provider.isActive)
    : null;
  const bayanOneRoutes = selectedModel === BAYAN_ONE_MODEL_ID
    ? resolveBayanOneRoutes(runtimeBayanOneConfig, runtimeProviders || [], runtimeModels || [])
    : [];
  const candidates = configuredRouteIds !== undefined
    ? configuredCandidates
    : selectedModel === BAYAN_ONE_MODEL_ID
    ? bayanOneRoutes
    : modelRoute
    ? (runtimeModels || [])
      .filter((item) => item.isEnabled && item.apiModelId === modelRoute.apiModelId)
      .map((route) => ({
        route,
        provider: runtimeProviders?.find((provider) => provider.id === route.apiId && provider.isActive && provider.apiKey),
      }))
      .filter((candidate): candidate is { route: NonNullable<typeof modelRoute>; provider: NonNullable<typeof primaryProvider> } => Boolean(candidate.provider))
      .sort((a, b) => a.provider.priority - b.provider.priority)
    : [];
  if ((selectedModel === BAYAN_ONE_MODEL_ID || configuredRouteIds !== undefined) && !candidates.length) {
    callbacks.onError({
      code: 'NO_AVAILABLE_PROVIDER',
      message: 'The selected AI capability is unavailable right now. Please try again later.',
      messageAr: 'إمكانية الذكاء الاصطناعي المحددة غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
    });
    return;
  }
  if (primaryProvider?.apiKey && !candidates.some(({ provider }) => provider.id === primaryProvider.id)) {
    candidates.unshift({ route: modelRoute!, provider: primaryProvider });
  }

  if (!providerOverrideId && candidates.length) {
    let lastError: ProviderFailure | null = null;
    const requestedApiId = (selectedModel === BAYAN_ONE_MODEL_ID ? candidates[0].provider.id : modelRoute?.apiId) || candidates[0].provider.id;
    for (const candidate of candidates) {
      if (signal?.aborted) {
        await callbacks.onFinish('');
        return;
      }
      const quota = await getProviderQuota(candidate.provider.id);
      let quotaUsed = Number(quota?.quotaUsed || 0);
      if (quota && new Date(String(quota.resetDate)).getTime() <= Date.now()) {
        await apiQuotas.update(quota.id, {
          quotaUsed: 0,
          resetDate: nextQuotaReset(quota.quotaPeriod === 'daily' ? 'daily' : 'monthly'),
        });
        quotaUsed = 0;
      }
      if (quota && Number(quota.quotaLimit) > 0 && quotaUsed >= Number(quota.quotaLimit)) {
        lastError = {
          code: 'PROVIDER_QUOTA_EXCEEDED',
          message: 'The AI service is temporarily busy. Please try again shortly.',
          messageAr: 'خدمة الذكاء الاصطناعي مشغولة مؤقتًا. يرجى المحاولة بعد قليل.',
        };
        continue;
      }
      let tokenCount = 0;
      const attemptState: { error: ProviderFailure | null } = { error: null };
      await streamChatCompletion({
        messages,
        model: selectedModel === BAYAN_ONE_MODEL_ID ? candidate.route.id : selectedModel,
        signal,
        customInstructions,
        thinkingMode,
        providerOverrideId: candidate.provider.id,
        upstreamModelOverride: configuredUpstreamModel,
        onProviderAccepted: async (apiId) => {
          const acceptedAt = new Date().toISOString();
          await recordProviderAcceptance(apiId, acceptedAt.slice(0, 10));
        },
        callbacks: {
          onToken: (token) => { tokenCount++; callbacks.onToken(token); },
          onError: (error) => { attemptState.error = error; },
          onFinish: callbacks.onFinish,
        },
      });
      const attemptError = attemptState.error;
      if (!attemptError) {
        if (signal?.aborted) return;
        const completedAt = new Date().toISOString();
        if (candidate.provider.id !== requestedApiId) {
          runProviderDiagnostics([
            {
              label: 'failover log',
              run: () => apiLogs.create(randomUUID(), {
              requestedApiId,
              selectedApiId: candidate.provider.id,
              modelId: selectedModel,
              reason: lastError?.code || 'PRIORITY_ORDER',
              createdAt: completedAt,
              }),
            },
            {
              label: 'last failover timestamp',
              run: () => updateProviderFailover(requestedApiId, completedAt),
            },
          ]);
        }
        return;
      }
      if (tokenCount) {
        callbacks.onError(attemptError);
        return;
      }
      lastError = attemptError;
      if (selectedModel === BAYAN_ONE_MODEL_ID && !shouldFallbackBayanOne(attemptError.code)) {
        callbacks.onError(attemptError);
        return;
      }
    }
    callbacks.onError(lastError || {
      code: 'NO_AVAILABLE_PROVIDER',
      message: 'The selected AI capability is unavailable right now. Please try again later.',
      messageAr: 'إمكانية الذكاء الاصطناعي المحددة غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
    });
    return;
  }

  const selectedProvider = candidates.find(({ provider }) => provider.id === providerOverrideId)?.provider || primaryProvider;
  const apiKey = selectedProvider?.apiKey ?? config.apiKey;
  const baseUrl = selectedProvider ? getChatCompletionsUrl(selectedProvider.baseUrl) : config.baseUrl;
  const upstreamModel = configuredUpstreamModel
    || candidates.find(({ provider }) => provider.id === providerOverrideId)?.route.apiModelId
    || modelRoute?.apiModelId
    || selectedModel;

  if (!candidates.length && !config.apiKey) {
    callbacks.onError({
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'The AI service is unavailable right now. Please try again later.',
      messageAr: 'خدمة الذكاء الاصطناعي غير متاحة حاليًا. يرجى المحاولة مرة أخرى لاحقًا.',
    });
    return;
  }

  // Prepend custom instructions or system persona if provided
  const preparedMessages: ChatMessage[] = [];
  if (customInstructions && customInstructions.trim()) {
    preparedMessages.push({
      role: 'system',
      content: `System instructions for Cintra:\n${customInstructions.trim()}`,
    });
  }

  preparedMessages.push(...messages.filter((message) => message.role === 'system'));
  preparedMessages.push({
    role: 'system',
    content: CINTRA_IDENTITY_POLICY,
  });
  preparedMessages.push({
    role: 'system',
    content: [
      'For a user-requested illustrated guide, or a multi-step technical explanation where a visual materially helps, include an internal image request on its own line using exactly [[CINTRA_IMAGE: concise, specific illustration prompt]]. The server replaces valid requests with generated, authenticated inline images; never invent image URLs or output the internal marker as a claimed image.',
      'Request no more than two images per answer, combining related steps into a single clear instructional diagram when useful. Generate illustrative diagrams, not fabricated screenshots, product interfaces, or evidence. Do not request images for routine answers or when visuals would not improve clarity.',
      'If the user needs a real screenshot or current visual evidence, do not fabricate it; explain that a verified screenshot is unavailable unless one was actually provided or retrieved from a trustworthy source.',
    ].join(' '),
  });
  const includesImageInput = messages.some((message) => (
    message.role === 'user'
    && Array.isArray(message.content)
    && message.content.some((part) => part.type === 'image_url')
  ));
  if (includesImageInput) {
    preparedMessages.push({
      role: 'system',
      content: [
        'The user provided image content to Cintra, developed by Eng. Ziad Saber. When this model/provider route supports visual input, inspect the supplied image and answer from its visible contents.',
        'Do not identify yourself as an underlying provider or generically claim to be a text-only model. Never claim to have seen or analyzed an image unless the current route actually processed it; if this route cannot inspect the image, explain that limitation honestly as Cintra.',
      ].join(' '),
    });
  }
  preparedMessages.push(...messages.filter((message) => message.role !== 'system'));

  const payload = {
    model: upstreamModel,
    messages: preparedMessages,
    stream: true,
    ...(thinkingMode && /^gpt-5(?:[.-]|$)/i.test(selectedModel)
      ? { reasoning_effort: 'high' }
      : {}),
  };

  const requestStartedAt = Date.now();
  let firstTokenLogged = false;
  const logFirstToken = () => {
    if (firstTokenLogged) return;
    firstTokenLogged = true;
    console.info('AI first token received:', {
      modelId: selectedModel,
      providerId: selectedProvider?.id || 'default',
      timeToFirstTokenMs: Date.now() - requestStartedAt,
    });
  };

  let response: Response;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 90000);
  const forwardAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const clearRequestTimeout = () => {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', forwardAbort);
  };

  try {
    response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: timeoutController.signal,
    });
  } catch (err: any) {
    clearRequestTimeout();
    if (signal?.aborted) {
      await callbacks.onFinish('');
      return;
    }
    if (timeoutController.signal.aborted) {
      callbacks.onError({
        code: 'NETWORK_TIMEOUT',
        message: 'The AI service is temporarily unavailable. Please try again shortly.',
        messageAr: 'خدمة الذكاء الاصطناعي غير متاحة مؤقتًا. يرجى المحاولة بعد قليل.',
      });
      return;
    }
    console.error('AI service connection failed:', {
      errorName: err instanceof Error ? err.name : 'UnknownError',
      providerId: selectedProvider?.id || 'default',
    });
    callbacks.onError({
      code: 'NETWORK_ERROR',
      message: 'The AI service is unavailable right now. Please try again later.',
      messageAr: 'خدمة الذكاء الاصطناعي غير متاحة حاليًا. يرجى المحاولة مرة أخرى لاحقًا.',
    });
    return;
  }

  if (response.ok && selectedProvider?.id && onProviderAccepted) {
    const acceptedProviderId = selectedProvider.id;
    void Promise.resolve()
      .then(() => onProviderAccepted(acceptedProviderId))
      .catch((error: unknown) => {
        console.error(`Could not record accepted request for API ${acceptedProviderId}:`, error);
      });
  }
  if (response.ok) {
      console.info('AI stream connected:', {
        modelId: selectedModel,
        providerId: selectedProvider?.id || 'default',
        responseHeadersMs: Date.now() - requestStartedAt,
      });
  }

  if (!response.ok) {
    clearRequestTimeout();
    console.error('AI service returned an unsuccessful response:', {
      status: response.status,
      providerId: selectedProvider?.id || 'default',
      modelId: selectedModel,
      responseTimeMs: Date.now() - requestStartedAt,
    });

    if (response.status === 401) {
      callbacks.onError({
        code: 'INVALID_API_KEY',
        message: 'The AI service is unavailable right now. Please try again later.',
        messageAr: 'خدمة الذكاء الاصطناعي غير متاحة حاليًا. يرجى المحاولة مرة أخرى لاحقًا.',
      });
    } else if (response.status === 403) {
      callbacks.onError({
        code: 'PROVIDER_ACCESS_DENIED',
        message: 'The AI service is unavailable right now. Please try again later.',
        messageAr: 'خدمة الذكاء الاصطناعي غير متاحة حاليًا. يرجى المحاولة مرة أخرى لاحقًا.',
      });
    } else if (response.status === 429) {
      callbacks.onError({
        code: 'PROVIDER_RATE_LIMIT',
        message: 'The AI service is temporarily busy. Please try again shortly.',
        messageAr: 'خدمة الذكاء الاصطناعي مشغولة مؤقتًا. يرجى المحاولة بعد قليل.',
      });
    } else if (response.status === 404) {
      callbacks.onError({
        code: 'MODEL_NOT_FOUND',
        message: 'The selected AI capability is unavailable right now. Please try again later.',
        messageAr: 'إمكانية الذكاء الاصطناعي المحددة غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
      });
    } else {
      callbacks.onError({
        code: `HTTP_${response.status}`,
        message: 'The AI service is unavailable right now. Please try again later.',
        messageAr: 'خدمة الذكاء الاصطناعي غير متاحة حاليًا. يرجى المحاولة مرة أخرى لاحقًا.',
      });
    }
    return;
  }

  if (!response.body) {
    clearRequestTimeout();
    callbacks.onError({
      code: 'NO_RESPONSE_BODY',
      message: 'The AI response could not be completed. Please try again later.',
      messageAr: 'تعذر إكمال استجابة الذكاء الاصطناعي. يرجى المحاولة مرة أخرى لاحقًا.',
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let accumulated = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // Ignore SSE comments or empty lines

        if (trimmed === 'data: [DONE]') {
          await callbacks.onFinish(accumulated);
          return;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              logFirstToken();
              accumulated += delta;
              callbacks.onToken(delta);
            }
          } catch {
            // Buffer chunk split across JSON boundary, continue
          }
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().startsWith('data: ')) {
      const jsonStr = buffer.trim().slice(6).trim();
      if (jsonStr && jsonStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            logFirstToken();
            accumulated += delta;
            callbacks.onToken(delta);
          }
        } catch {}
      }
    }

    await callbacks.onFinish(accumulated);
  } catch (streamErr: any) {
    if (signal?.aborted) {
      await callbacks.onFinish(accumulated);
      return;
    }
    if (timeoutController.signal.aborted) {
      callbacks.onError({
        code: 'NETWORK_TIMEOUT',
        message: 'The AI service is temporarily unavailable. Please try again shortly.',
        messageAr: 'خدمة الذكاء الاصطناعي غير متاحة مؤقتًا. يرجى المحاولة بعد قليل.',
      });
    } else {
      console.error('AI response stream failed:', {
        errorName: streamErr instanceof Error ? streamErr.name : 'UnknownError',
        providerId: selectedProvider?.id || 'default',
      });
      callbacks.onError({
        code: 'STREAM_ERROR',
        message: 'The AI response could not be completed. Please try again later.',
        messageAr: 'تعذر إكمال استجابة الذكاء الاصطناعي. يرجى المحاولة مرة أخرى لاحقًا.',
      });
    }
  } finally {
    clearRequestTimeout();
  }
}
