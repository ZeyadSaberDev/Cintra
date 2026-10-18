export const BAYAN_ONE_MODEL_ID = 'bayan-one';
export const BAYAN_ONE_MODEL_NAME = 'Bayan One';

export interface BayanOneProvider {
  id: string;
  apiKey: string;
  baseUrl: string;
  isActive: boolean;
  priority: number;
}

export interface BayanOneModelRoute {
  id: string;
  apiId: string;
  apiModelId: string;
  isEnabled: boolean;
}

export interface BayanOneConfig {
  active: boolean;
  modelIds: string[];
  autoLinkNewApis: boolean;
}

export function resolveBayanOneRoutes(
  config: BayanOneConfig,
  providers: BayanOneProvider[],
  models: BayanOneModelRoute[],
): Array<{ route: BayanOneModelRoute; provider: BayanOneProvider }> {
  if (!config.active) return [];
  const linkedIds = new Set(config.modelIds);
  return models
    .filter((model) => linkedIds.has(model.id) && model.isEnabled)
    .map((route) => ({
      route,
      provider: providers.find((provider) => provider.id === route.apiId && provider.isActive && Boolean(provider.apiKey)),
    }))
    .filter((candidate): candidate is { route: BayanOneModelRoute; provider: BayanOneProvider } => Boolean(candidate.provider))
    .sort((left, right) => left.provider.priority - right.provider.priority || left.provider.id.localeCompare(right.provider.id));
}

export function shouldFallbackBayanOne(code: string): boolean {
  return code === 'PROVIDER_RATE_LIMIT'
    || code === 'PROVIDER_QUOTA_EXCEEDED'
    || code === 'NETWORK_ERROR'
    || code === 'NETWORK_TIMEOUT'
    || code === 'NO_RESPONSE_BODY'
    || code === 'MODEL_NOT_FOUND'
    || code === 'STREAM_ERROR'
    || /^HTTP_5\d\d$/.test(code);
}

export function autoLinkBayanOneModelIds(
  config: BayanOneConfig,
  linkedModels: Array<{ id: string; apiId: string }>,
  newModels: Array<{ id: string; apiId: string; isEnabled: boolean }>,
  availableApiIds: Set<string>,
): string[] {
  if (!config.autoLinkNewApis) return config.modelIds;
  const linkedIds = new Set(config.modelIds);
  const occupiedApiIds = new Set(linkedModels
    .filter((model) => linkedIds.has(model.id))
    .map((model) => model.apiId));
  const additions: string[] = [];
  for (const model of newModels) {
    if (!model.isEnabled || !availableApiIds.has(model.apiId) || occupiedApiIds.has(model.apiId)) continue;
    additions.push(model.id);
    occupiedApiIds.add(model.apiId);
  }
  return [...config.modelIds, ...additions];
}
