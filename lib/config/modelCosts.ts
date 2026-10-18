export type ModelCostTier = 'High' | 'Medium' | 'Low';

export interface ModelCost {
  tier: ModelCostTier;
  credits: number;
  icon: '💎' | '⭐' | '⚡';
  colorClass: string;
}

const HIGH_COST: ModelCost = { tier: 'High', credits: 8, icon: '💎', colorClass: 'text-red-600' };
const MEDIUM_COST: ModelCost = { tier: 'Medium', credits: 4, icon: '⭐', colorClass: 'text-orange-600' };
const LOW_COST: ModelCost = { tier: 'Low', credits: 1, icon: '⚡', colorClass: 'text-emerald-600' };

export const MODEL_COSTS: Readonly<Record<ModelCostTier, ModelCost>> = {
  High: HIGH_COST,
  Medium: MEDIUM_COST,
  Low: LOW_COST,
};

export function getModelCost(modelId: string): ModelCost {
  const id = modelId.toLowerCase();

  if (
    id.includes('claude-opus') ||
    id.includes('claude-mythos') ||
    id.includes('kimi-k3') ||
    id.includes('gpt-5.6-sol') ||
    id.includes('gpt-5.6-terra')
  ) return HIGH_COST;

  if (
    id.includes('claude-sonnet') ||
    id.includes('gpt-5.5-pro') ||
    (id.includes('deepseek') && id.includes('pro')) ||
    id.includes('gemini-3.1')
  ) return MEDIUM_COST;

  if (
    id.includes('claude-fable') ||
    id.includes('gpt-5.5') ||
    id.includes('deepseek') ||
    (id.includes('gemini') && id.includes('flash')) ||
    id.includes('gemma') ||
    id.includes('qwen')
  ) return LOW_COST;

  return MEDIUM_COST;
}
