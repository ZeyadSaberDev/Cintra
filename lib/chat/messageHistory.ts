export interface ConversationHistoryEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  createdAt?: string;
  editedAt?: string;
  isPriorHistory?: boolean;
}

export const AI_CONTEXT_MESSAGE_LIMIT = 10;

export function conversationContextQuery(
  conversationId: string,
  beforeMessage?: Pick<ConversationHistoryEntry, 'id' | 'createdAt'>,
) {
  return {
    filters: [{ field: 'conversationId', op: '==' as const, value: conversationId }],
    orderBy: [
      { field: 'createdAt', direction: 'desc' as const },
      { field: 'id', direction: 'desc' as const },
    ],
    limit: AI_CONTEXT_MESSAGE_LIMIT,
    ...(beforeMessage?.createdAt
      ? { startAtValues: [beforeMessage.createdAt, beforeMessage.id] }
      : {}),
  };
}

export function chronologicalContext<T>(messages: T[]): T[] {
  return messages.reverse();
}

export function historyThroughEditedMessage<T extends Pick<ConversationHistoryEntry, 'id'>>(
  messages: T[],
  editedMessageId?: string,
): T[] {
  if (!editedMessageId) return messages;
  const editedIndex = messages.findIndex((message) => message.id === editedMessageId);
  return editedIndex < 0 ? messages : messages.slice(0, editedIndex + 1);
}

export function markHistoryBeforeEdits<T extends ConversationHistoryEntry>(
  messages: T[],
): Array<T & Pick<ConversationHistoryEntry, 'isPriorHistory'>> {
  return messages.map((message, messageIndex) => ({
    ...message,
    isPriorHistory: messages.some((editedMessage, editedIndex) =>
      editedMessage.role === 'user'
      && Boolean(editedMessage.editedAt)
      && messageIndex > editedIndex
      && Boolean(message.createdAt)
      && message.createdAt! < editedMessage.editedAt!),
  }));
}
