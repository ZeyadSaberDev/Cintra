export interface GroupableModel {
  id: string;
  name: string;
  group?: string;
  provider?: string;
  description?: string;
  badge?: string;
  costTier?: 'High' | 'Medium' | 'Low';
  capabilities?: {
    visionInput?: boolean;
    toolCalling?: boolean;
    structuredOutput?: boolean;
  };
}

const publicProviders = new Set([
  'Bayan AI',
  'Cintra',
  'Claude',
  'OpenAI',
  'DeepSeek',
  'Google Gemini',
  'Qwen',
  'Kimi',
  'Other',
]);

function normalizeCostTier(value: unknown): GroupableModel['costTier'] {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'low') return 'Low';
  return undefined;
}

function normalizeCapabilities(value: unknown): GroupableModel['capabilities'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  const capabilities = {
    ...(typeof item.visionInput === 'boolean' ? { visionInput: item.visionInput } : {}),
    ...(typeof item.toolCalling === 'boolean' ? { toolCalling: item.toolCalling } : {}),
    ...(typeof item.structuredOutput === 'boolean' ? { structuredOutput: item.structuredOutput } : {}),
  };
  return Object.keys(capabilities).length ? capabilities : undefined;
}

export function normalizePublicModelCatalog(value: unknown): GroupableModel[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const models: GroupableModel[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.provider !== 'string') continue;
    const id = item.id.trim();
    const name = item.name.trim();
    const provider = item.provider.trim();
    const costTier = normalizeCostTier(item.costTier);
    const capabilities = normalizeCapabilities(item.capabilities);
    if (!id || !name || !provider || id.length > 200 || name.length > 200 || /[\u0000-\u001f\u007f]/u.test(id)) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    models.push({
      id,
      name,
      provider: publicProviders.has(provider) ? provider : 'Other',
      ...(typeof item.group === 'string' && item.group.trim() ? { group: item.group.trim().slice(0, 80) } : {}),
      ...(typeof item.description === 'string' && item.description.trim() ? { description: item.description.trim().slice(0, 300) } : {}),
      ...(typeof item.badge === 'string' && item.badge.trim() ? { badge: item.badge.trim().slice(0, 40) } : {}),
      ...(costTier ? { costTier } : {}),
      ...(capabilities ? { capabilities } : {}),
    });
  }
  return models;
}

const familyOrder = [
  'Cintra',
  'Claude',
  'OpenAI',
  'Google Gemini',
  'DeepSeek',
  'Qwen',
  'Kimi',
  'Grok',
  'GLM',
  'ByteDance',
  'Mistral',
  'Meta',
  'Other',
];

const knownFamilies = new Map(familyOrder.map((family) => [family.toLowerCase(), family]));

export function getModelFamily(model: GroupableModel): string {
  const group = model.group || model.provider || '';
  const knownFamily = knownFamilies.get(group.trim().toLowerCase());
  if (knownFamily) return knownFamily;

  const modelId = `${model.id} ${model.name}`.toLowerCase();
  if (/claude|anthropic/.test(modelId)) return 'Claude';
  if (/^gpt|openai|(^|\s)o[134](?:[-.\s]|$)/.test(modelId)) return 'OpenAI';
  if (/gemini|gemma/.test(modelId)) return 'Google Gemini';
  if (/deepseek/.test(modelId)) return 'DeepSeek';
  if (/qwen/.test(modelId)) return 'Qwen';
  if (/kimi|moonshot/.test(modelId)) return 'Kimi';
  if (/grok|xai/.test(modelId)) return 'Grok';
  if (/\bglm\b|zhipu/.test(modelId)) return 'GLM';
  if (/seed|doubao|bytedance/.test(modelId)) return 'ByteDance';
  if (/mistral|mixtral/.test(modelId)) return 'Mistral';
  if (/llama|meta-llama/.test(modelId)) return 'Meta';
  return 'Other';
}

export function groupModelsByFamily<T extends GroupableModel>(
  models: T[],
): Array<{ family: string; models: T[] }> {
  const groups = new Map<string, T[]>();
  for (const model of models) {
    const family = getModelFamily(model);
    groups.set(family, [...(groups.get(family) || []), model]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftIndex = familyOrder.indexOf(left);
      const rightIndex = familyOrder.indexOf(right);
      return (leftIndex < 0 ? familyOrder.length : leftIndex) - (rightIndex < 0 ? familyOrder.length : rightIndex)
        || left.localeCompare(right);
    })
    .map(([family, groupedModels]) => ({ family, models: groupedModels }));
}
