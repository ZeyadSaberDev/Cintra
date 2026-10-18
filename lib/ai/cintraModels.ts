export const CINTRA_MODELS = [
  {
    id: 'cintra-core-v1',
    name: '🚀 Cintra Core v1',
    description: 'Conversations, coding, and intelligent context',
  },
  {
    id: 'cintra-research',
    name: '🔍 Cintra Research',
    description: 'Web-connected research and source analysis',
  },
  {
    id: 'cintra-creative',
    name: '🎨 Cintra Creative',
    description: 'Image generation and visual understanding',
  },
  {
    id: 'cintra-analyst',
    name: '💼 Cintra Analyst',
    description: 'Documents, files, and PDF workflows',
  },
] as const;

export type CintraModelId = (typeof CINTRA_MODELS)[number]['id'];
export type CintraModelRoutes = Record<CintraModelId, string[]>;
export const AUTO_CINTRA_ROUTE_PREFIX = 'auto:';

type AutoCintraRoute = {
  id: string;
  name: 'Auto';
  apiId: string;
  apiModelId: 'auto';
  isEnabled: true;
};

export function resolveCintraRouteCandidates<
  TModel extends { id: string; apiId: string; isEnabled: boolean },
  TProvider extends { id: string; apiKey: string; isActive: boolean; priority: number },
>(
  modelId: CintraModelId,
  routes: CintraModelRoutes,
  models: TModel[],
  providers: TProvider[],
): Array<{ route: TModel | AutoCintraRoute; provider: TProvider }> {
  const candidates: Array<{ route: TModel | AutoCintraRoute; provider: TProvider }> = [];
  for (const id of routes[modelId]) {
    if (id.startsWith(AUTO_CINTRA_ROUTE_PREFIX)) {
      const providerId = id.slice(AUTO_CINTRA_ROUTE_PREFIX.length);
      const provider = providers.find((item) => item.id === providerId && item.isActive && item.apiKey.trim());
      if (provider) {
        candidates.push({
          route: {
            id,
            name: 'Auto',
            apiId: provider.id,
            apiModelId: 'auto',
            isEnabled: true,
          },
          provider,
        });
      }
      continue;
    }

    const route = models.find((model) => model.id === id && model.isEnabled);
    if (!route) continue;
    const provider = providers.find((item) => item.id === route.apiId && item.isActive && item.apiKey.trim());
    if (provider) candidates.push({ route, provider });
  }
  return candidates.sort((left, right) => left.provider.priority - right.provider.priority);
}

const capabilityPatterns: Record<Exclude<CintraModelId, 'cintra-core-v1'>, RegExp> = {
  'cintra-research': /research|search|web|browse/i,
  'cintra-creative': /vision|image|creative|multimodal/i,
  'cintra-analyst': /analyst|analysis|document|pdf|file/i,
};

export function createDefaultCintraModelRoutes(
  models: Array<{ id: string; name: string; apiId: string; isEnabled: boolean }>,
  coreRouteIds: string[],
): CintraModelRoutes {
  const enabledByApi = new Map<string, typeof models>();
  for (const model of models) {
    if (!model.isEnabled) continue;
    enabledByApi.set(model.apiId, [...(enabledByApi.get(model.apiId) || []), model]);
  }
  const coreRouteByApi = new Map<string, string>();
  for (const id of coreRouteIds) {
    const model = models.find((candidate) => candidate.id === id && candidate.isEnabled);
    if (model) coreRouteByApi.set(model.apiId, model.id);
  }
  const routes: CintraModelRoutes = {
    'cintra-core-v1': [],
    'cintra-research': [],
    'cintra-creative': [],
    'cintra-analyst': [],
  };

  for (const [apiId, coreRouteId] of coreRouteByApi) {
    const apiModels = enabledByApi.get(apiId) || [];
    const coreModel = apiModels.find((model) => model.id === coreRouteId);
    if (!coreModel) continue;
    routes['cintra-core-v1'].push(coreModel.id);

    for (const modelId of ['cintra-research', 'cintra-creative', 'cintra-analyst'] as const) {
      const pattern = capabilityPatterns[modelId];
      const capabilityModel = apiModels.find((model) => pattern.test(`${model.id} ${model.name}`));
      routes[modelId].push((capabilityModel || coreModel).id);
    }
  }

  return routes;
}

export const CINTRA_IDENTITY_POLICY = "اسمك Cintra، وأنت مساعد ذكاء اصطناعي متقدم بصيغة المذكر، طوّرك المهندس زياد صابر. إذا سُئلت عن هويتك أو مطورك، عرّف بنفسك بأنك Cintra من تطوير المهندس زياد صابر. لا تدّعِ أنك نموذج أو مساعد تابع لشركة أخرى، ولا تكشف اسم النموذج أو المزوّد أو تفاصيل البنية الداخلية. يمكنك مناقشة الشركات والمنتجات والتقنيات الأخرى بالاسم عندما يكون ذلك جزءاً من سؤال المستخدم أو ضرورياً للإجابة، وقدّم معلومات واقعية ومحايدة دون الإيحاء بأنك تابع لها. لا ترفض ذكر شركة لمجرد أنها جهة أخرى.\n\nYour name is Cintra. You are an advanced AI assistant developed by Eng. Ziad Saber. When asked about your identity or developer, identify yourself as Cintra, developed by Eng. Ziad Saber. Never claim that you are another company's model or assistant, and do not disclose the underlying model, provider, or internal infrastructure. You may discuss other companies, products, and technologies by name when relevant to the user's question; answer factual and neutral questions normally. Do not refuse to name a company merely because it is a third party.";

export function isCintraModelId(modelId: string): modelId is CintraModelId {
  return CINTRA_MODELS.some((model) => model.id === modelId);
}

export function resolveCintraFusionModel(modelId: string, defaultModel: string): string | null {
  return modelId === 'cintra-core-v1' && defaultModel === 'auto' ? 'auto' : null;
}

export function resolveCintraModelId(
  modelId: string,
  availableModels: Array<{ id: string; name: string }>,
  defaultModel: string,
): string {
  if (!isCintraModelId(modelId)) return modelId;
  if (modelId === 'cintra-core-v1') return defaultModel;

  const capabilityPattern = capabilityPatterns[modelId];
  return availableModels.find((model) => capabilityPattern.test(`${model.id} ${model.name}`))?.id
    || defaultModel;
}
