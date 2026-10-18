export function ownsConversation(conversationUserId: unknown, userId: string): boolean {
  return conversationUserId === userId;
}

export function hasReachedDailyMessageLimit(count: number, limit: number): boolean {
  return count >= limit;
}

export function resolveDailyMessageLimit(plan: string, override: unknown, defaultLimit: number): number | null {
  if (Number.isInteger(override)) return Number(override);
  return plan === 'free' ? defaultLimit : null;
}
