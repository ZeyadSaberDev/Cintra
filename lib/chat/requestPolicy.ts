export function ownsConversation(conversationUserId: unknown, userId: string): boolean {
  return conversationUserId === userId;
}

export function hasReachedDailyMessageLimit(count: number, limit: number): boolean {
  return count >= limit;
}
