export function reorderApiIds<T extends { id: string; priority: number }>(
  apis: T[],
  apiId: string,
  requestedPriority: number,
): string[] {
  const ordered = [...apis].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  const currentIndex = ordered.findIndex((api) => api.id === apiId);
  if (currentIndex < 0 || !Number.isFinite(requestedPriority)) return ordered.map((api) => api.id);
  const [api] = ordered.splice(currentIndex, 1);
  const targetIndex = Math.max(0, Math.min(ordered.length, Math.floor(requestedPriority) - 1));
  ordered.splice(targetIndex, 0, api);
  return ordered.map((item) => item.id);
}

export function filterModelsByApi<T extends { apiId: string }>(models: T[], apiId: string): T[] {
  return apiId ? models.filter((model) => model.apiId === apiId) : models;
}
