export interface GroupableModel {
  id: string;
  name: string;
  group?: string;
  provider?: string;
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
