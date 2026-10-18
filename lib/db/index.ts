import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  LocalRepository,
  runLocalTransaction,
  type DataFilter,
  type DataDocument,
  type DataListOptions,
} from './repository.js';
import type { DataCollection } from './collections.js';
import { initLocalDatabase } from './sqlite.js';
import { deleteLocalFile, deleteLocalFilesForOwner, localStorageId } from '../storage/local.js';
import {
  creditCounterId,
  decrementCreditCounter,
  deleteServerCounter,
  ensureServerCounter,
  getServerCounter,
  incrementServerCounter,
  listServerCounters,
  setCreditCounter,
  updateServerCounter,
  usageCounterId,
} from './counters.js';
import {
  chronologicalContext,
  conversationContextQuery,
} from '../chat/messageHistory.js';

export async function initDb(): Promise<void> {
  await initLocalDatabase();
  console.log('Connected to the local Cintra database.');
}

export interface DbUser extends Record<string, any> {
  id: string;
  authUserId?: string | null;
  name: string | null;
  email: string | null;
  emailVerified: string | null;
  avatar: string | null;
  isGuest: number | boolean;
  role: 'user' | 'admin';
  isBanned: number | boolean;
  languagePreference: 'auto' | 'ar' | 'en';
  customInstructions: string | null;
  tone: 'Formal' | 'Conversational' | 'Creative' | 'Academic' | 'Professional';
  responseLength: 'Brief' | 'Normal' | 'Detailed';
  writingStyle: 'Simple' | 'Technical' | 'Poetic' | 'Casual';
  languageVariant: string | null;
  theme: 'light' | 'dark' | 'auto';
  accentColor: string;
  creditBalance: number;
  studyModeEnabled: number | boolean;
  highlightUserMessages: number | boolean;
  highlightAssistantAnswers: number | boolean;
  userMessageHighlightColor: string;
  assistantAnswerHighlightColor: string;
  voiceEnabled: number | boolean;
  ttsVoice: string;
  ttsSpeed: number;
  preferredLanguage: string;
  plan: 'free' | 'pro' | 'pro_plus';
  stripeCustomerId: string | null;
  dailyMessageLimit: number;
  dailyMessageLimitOverride?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbConversation extends Record<string, any> {
  id: string;
  userId: string;
  title: string;
  model: string;
  isPinned: number;
  createdAt: string;
  updatedAt: string;
}

export interface DbMessage extends Record<string, any> {
  id: string;
  userId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens: number | null;
  model: string | null;
  createdAt: string;
  editedAt?: string;
}

export interface DbUsageLog extends Record<string, any> {
  id: string;
  userId: string;
  date: string;
  count: number;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

type StoredDocument = DataDocument & { fileUrl?: unknown; __storageFields?: unknown };

const users = new LocalRepository<DbUser>('User');
const usageLogs = new LocalRepository<DbUsageLog>('UsageLog');
const conversations = new LocalRepository<DbConversation>('Conversation');
const messages = new LocalRepository<DbMessage>('Message');
const sharedLinks = new LocalRepository<StoredDocument>('SharedLink');
const feedback = new LocalRepository<StoredDocument>('Feedback');

function filter(field: string, value: unknown): DataFilter {
  return { field, op: '==', value };
}

async function deleteRows(
  collection: DataCollection,
  rows: Array<{ id: string }>,
): Promise<void> {
  const repository = new LocalRepository(collection);
  for (let offset = 0; offset < rows.length; offset += 100) {
    await Promise.all(rows.slice(offset, offset + 100).map(({ id }) => repository.delete(id)));
  }
}

async function deleteFiles(rows: Array<{ id?: string; fileUrl?: unknown }>): Promise<void> {
  await Promise.all(rows.map(async ({ id, fileUrl }) => {
    if (fileUrl === undefined || fileUrl === null || fileUrl === '') return;
    if (typeof fileUrl !== 'string') {
      throw new Error(`Cannot delete local file for ${id || 'record'}: fileUrl is not a string.`);
    }
    if (!localStorageId(fileUrl)) {
      throw new Error(`Cannot delete local file for ${id || 'record'}: the reference is invalid or the file is missing.`);
    }
    await deleteLocalFile(fileUrl);
  }));
}

async function deletePdfTextFiles(rows: Array<StoredDocument>): Promise<void> {
  await Promise.all(rows.map(async ({ __storageFields }) => {
    if (!__storageFields || typeof __storageFields !== 'object') return;
    const reference = (__storageFields as Record<string, unknown>).extractedText;
    if (typeof reference === 'string' && reference.startsWith('local://')) {
      if (!localStorageId(reference)) throw new Error('Invalid extracted PDF text file reference.');
      await deleteLocalFile(reference);
    }
  }));
}

async function deleteChildrenForMessages(
  collection: 'Feedback' | 'Attachment' | 'MessageAudio' | 'StudyNote' | 'StudyArtifact',
  messageIds: string[],
): Promise<StoredDocument[]> {
  const repository = new LocalRepository<StoredDocument>(collection);
  const rows: StoredDocument[] = [];
  for (let offset = 0; offset < messageIds.length; offset += 30) {
    const ids = messageIds.slice(offset, offset + 30);
    rows.push(...await repository.list({
      filters: [{ field: 'messageId', op: 'in', value: ids }],
    }));
  }
  return rows;
}

async function deleteConversationTree(conversationId: string): Promise<void> {
  const conversationMessages = await messages.list({
    filters: [filter('conversationId', conversationId)],
  });
  const attachedPdfs = await new LocalRepository<StoredDocument>('PDFDocument').list({
    filters: [filter('conversationId', conversationId)],
  });
  const messageIds = conversationMessages.map(({ id }) => id);
  const related = await Promise.all([
    deleteChildrenForMessages('Feedback', messageIds),
    deleteChildrenForMessages('Attachment', messageIds),
    deleteChildrenForMessages('MessageAudio', messageIds),
    deleteChildrenForMessages('StudyNote', messageIds),
    deleteChildrenForMessages('StudyArtifact', messageIds),
    sharedLinks.list({ filters: [filter('conversationId', conversationId)] }),
  ]);
  await Promise.all([
    deleteFiles(related[1]),
    deleteFiles(related[2]),
    deletePdfTextFiles(attachedPdfs),
  ]);

  const allReferences = [
    ...related.flatMap((rows, index) => rows.map((row) => ({
      collection: (['Feedback', 'Attachment', 'MessageAudio', 'StudyNote', 'StudyArtifact', 'SharedLink'] as const)[index],
      id: row.id,
    }))),
    ...conversationMessages.map(({ id }) => ({ collection: 'Message' as const, id })),
    { collection: 'Conversation' as const, id: conversationId },
  ];
  for (let offset = 0; offset < attachedPdfs.length; offset += 100) {
    await Promise.all(attachedPdfs.slice(offset, offset + 100).map((pdf) =>
      new LocalRepository<StoredDocument>('PDFDocument').update(pdf.id, { conversationId: null })));
  }
  for (let offset = 0; offset < allReferences.length; offset += 100) {
    await Promise.all(allReferences.slice(offset, offset + 100).map((row) =>
      new LocalRepository(row.collection).delete(row.id)));
  }
}

// User model operations
export const userRepo = {
  async findByEmail(email: string): Promise<DbUser | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const matches = await users.list({ filters: [filter('email', normalizedEmail)], limit: 1 });
    return matches[0] ? this.findById(matches[0].id) : null;
  },

  async findById(id: string): Promise<DbUser | null> {
    const user = await users.get(id);
    if (!user) return null;
    const balance = await ensureServerCounter(creditCounterId(id), {
      kind: 'credit',
      userId: id,
      date: '',
      count: 0,
      balance: Number(user.creditBalance || 0),
      creditsConsumed: 0,
      model: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { ...user, creditBalance: Number(balance.balance) || 0 };
  },

  async findByAuthId(authUserId: string): Promise<DbUser | null> {
    const matches = await users.list({ filters: [filter('authUserId', authUserId)], limit: 1 });
    return matches[0] ? this.findById(matches[0].id) : null;
  },

  async create(data: {
    id: string;
    authUserId?: string | null;
    email?: string | null;
    name?: string | null;
    avatar?: string | null;
    isGuest?: boolean;
    languagePreference?: 'auto' | 'ar' | 'en';
    emailVerified?: string | null;
  }): Promise<DbUser> {
    const now = new Date().toISOString();
    const user: Omit<DbUser, 'id'> = {
      authUserId: data.authUserId || null,
      name: data.name || null,
      email: data.email ? data.email.trim().toLowerCase() : null,
      emailVerified: data.emailVerified || null,
      avatar: data.avatar || null,
      isGuest: data.isGuest ? 1 : 0,
      role: 'user',
      isBanned: 0,
      languagePreference: data.languagePreference || 'auto',
      customInstructions: null,
      tone: 'Conversational',
      responseLength: 'Normal',
      writingStyle: 'Simple',
      languageVariant: null,
      theme: 'light',
      accentColor: '#6366f1',
      creditBalance: 0,
      studyModeEnabled: 0,
      highlightUserMessages: 1,
      highlightAssistantAnswers: 1,
      userMessageHighlightColor: '#818cf8',
      assistantAnswerHighlightColor: '#fbbf24',
      voiceEnabled: 0,
      ttsVoice: '',
      ttsSpeed: 1,
      preferredLanguage: 'en-US',
      plan: 'free',
      stripeCustomerId: null,
      dailyMessageLimit: 50,
      dailyMessageLimitOverride: null,
      createdAt: now,
      updatedAt: now,
    };
    await users.create(data.id, user);
    return (await this.findById(data.id))!;
  },

  async update(id: string, updates: Partial<DbUser>): Promise<DbUser | null> {
    const fields = Object.fromEntries(
      Object.entries(updates).filter(([key, value]) => key !== 'id' && value !== undefined),
    );
    if (Object.keys(fields).length === 0) return this.findById(id);
    const creditBalance = typeof fields.creditBalance === 'number' ? fields.creditBalance : undefined;
    delete fields.creditBalance;
    if (Object.keys(fields).length) {
      await users.update(id, { ...fields, updatedAt: new Date().toISOString() });
    }
    if (creditBalance !== undefined) {
      if (!Number.isSafeInteger(creditBalance) || creditBalance < 0) {
        throw new RangeError('Credit balance must be a non-negative safe integer.');
      }
      await setCreditCounter(creditCounterId(id), creditBalance);
    }
    return this.findById(id);
  },

  async debitCredits(id: string, amount: number): Promise<boolean> {
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;
    const user = await users.get(id);
    if (!user) return false;
    const counterId = creditCounterId(id);
    const balance = await ensureServerCounter(counterId, {
      kind: 'credit',
      userId: id,
      date: '',
      count: 0,
      balance: Number(user.creditBalance || 0),
      creditsConsumed: 0,
      model: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (Number(balance.balance) < amount) return false;
    try {
      await decrementCreditCounter(counterId, amount);
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && Number((error as { code: unknown }).code) === 409) return false;
      throw error;
    }
  },

  async delete(id: string): Promise<boolean> {
    const profile = await users.get(id);
    if (!profile) return false;
    if (typeof profile.avatar === 'string' && profile.avatar.startsWith('local://')) {
      if (!localStorageId(profile.avatar)) throw new Error('Invalid user avatar file reference.');
      await deleteLocalFile(profile.avatar);
    }

    const ownedConversations = await conversations.list({ filters: [filter('userId', id)] });
    for (const conversation of ownedConversations) {
      await deleteConversationTree(conversation.id);
    }

    const pdfDocuments = await new LocalRepository<StoredDocument>('PDFDocument').list({
      filters: [filter('userId', id)],
    });
    await Promise.all([
      deleteFiles(pdfDocuments),
      deletePdfTextFiles(pdfDocuments),
    ]);
    const pdfOperations = new LocalRepository<StoredDocument>('PDFOperation');
    for (const pdf of pdfDocuments) {
      await deleteRows('PDFOperation', await pdfOperations.list({ filters: [filter('pdfId', pdf.id)] }));
    }
    await deleteRows('PDFDocument', pdfDocuments);

    const agents = await new LocalRepository<StoredDocument>('Agent').list({
      filters: [filter('userId', id)],
    });
    for (const agent of agents) {
      await deleteRows('AgentAction', await new LocalRepository<StoredDocument>('AgentAction')
        .list({ filters: [filter('agentId', agent.id)] }));
      await deleteRows('AgentApproval', await new LocalRepository<StoredDocument>('AgentApproval')
        .list({ filters: [filter('agentId', agent.id)] }));
    }
    await deleteRows('Agent', agents);

    const messageRows = await messages.list({ filters: [filter('userId', id)] });
    await deleteRows('Message', messageRows);

    const ownedEmailChallenges = profile.email
      ? await new LocalRepository<StoredDocument>('EmailOtp').list({ filters: [filter('email', profile.email)] })
      : [];
    await deleteRows('EmailOtp', ownedEmailChallenges);

    const identifiers = new Set([id, profile.authUserId, profile.email].filter((value): value is string => typeof value === 'string' && value.length > 0));
    const adminLogs = await new LocalRepository<StoredDocument>('AdminLog').list();
    await deleteRows('AdminLog', adminLogs.filter((row) => typeof row.target === 'string' && identifiers.has(row.target)));

    for (const collection of [
      'UsageLog', 'MessageAudio', 'Attachment', 'StudyNote', 'StudyArtifact', 'Subscription',
      'Payment', 'PendingUpload', 'Feedback', 'SharedLink', 'PDFOperation', 'AgentAction',
      'AgentApproval', 'ApiRequestLog', 'UserEventLog', 'GuestDevice', 'Account', 'Session',
      'PasswordReset',
    ] as const) {
      const repository = new LocalRepository<StoredDocument>(collection);
      const rows = await repository.list({ filters: [filter('userId', id)] });
      if (collection === 'MessageAudio' || collection === 'Attachment' || collection === 'PendingUpload') {
        await deleteFiles(rows);
      }
      await deleteRows(collection, rows);
    }

    const userCounters = (await listServerCounters()).filter((row) => row.userId === id);
    await Promise.all(userCounters.map((row) => deleteServerCounter(row.$id)));
    await deleteLocalFilesForOwner(id);
    return users.delete(id);
  },
};

// Usage log operations
async function ensureUsageCounter(userId: string, date: string, model: string) {
  const rowId = usageCounterId(userId, date);
  const existing = await getServerCounter(rowId);
  if (existing) return existing;
  const legacy = (await usageLogs.list({
    filters: [filter('userId', userId), filter('date', date)],
    limit: 1,
  }))[0];
  return ensureServerCounter(rowId, {
    kind: 'usage',
    userId,
    date,
    count: Number(legacy?.count) || 0,
    balance: 0,
    creditsConsumed: Number(legacy?.creditsConsumed) || 0,
    model: model || String(legacy?.model || ''),
    createdAt: String(legacy?.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  });
}

function matchesUsageFilter(row: DbUsageLog, item: DataFilter): boolean {
  const actual = item.field === 'id' ? row.id : row[item.field];
  const expected = item.value;
  if (item.op === '==') return actual === expected;
  if (item.op === '!=') return actual !== expected;
  if (item.op === 'in') return Array.isArray(expected) && expected.includes(actual);
  if (item.op === 'array-contains') return Array.isArray(actual) && actual.includes(expected);
  if (item.op === '>') return Number(actual) > Number(expected);
  if (item.op === '>=') return Number(actual) >= Number(expected);
  if (item.op === '<') return Number(actual) < Number(expected);
  return Number(actual) <= Number(expected);
}

export const usageRepo = {
  async list(options: DataListOptions = {}): Promise<DbUsageLog[]> {
    const [legacyRows, counters] = await Promise.all([
      usageLogs.list({ limit: 100_000 }),
      listServerCounters(),
    ]);
    const rowsByDay = new Map<string, DbUsageLog>();
    for (const row of legacyRows) rowsByDay.set(`${row.userId}:${row.date}`, row);
    for (const row of counters) {
      if (row.kind !== 'usage') continue;
      rowsByDay.set(`${row.userId}:${row.date}`, {
        id: row.$id,
        userId: row.userId,
        date: row.date,
        count: Number(row.count) || 0,
        model: row.model || null,
        creditsConsumed: Number(row.creditsConsumed) || 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
    let rows = [...rowsByDay.values()].filter((row) =>
      (options.filters || []).every((item) => matchesUsageFilter(row, item)));
    if (options.orderBy?.length) {
      rows.sort((left, right) => {
        for (const order of options.orderBy || []) {
          const a = order.field === 'id' ? left.id : left[order.field];
          const b = order.field === 'id' ? right.id : right[order.field];
          const compare = typeof a === 'number' && typeof b === 'number'
            ? a - b
            : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
          if (compare) return order.direction === 'desc' ? -compare : compare;
        }
        return 0;
      });
    }
    if (options.startAfter) {
      const index = rows.findIndex((row) => row.id === options.startAfter);
      if (index >= 0) rows = rows.slice(index + 1);
    }
    const offset = options.offset || 0;
    return rows.slice(offset, options.limit === undefined ? undefined : offset + options.limit);
  },

  async getTodayCount(userId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const counter = await ensureUsageCounter(userId, today, '');
    return Number(counter.count) || 0;
  },

  async increment(userId: string, model: string, creditsConsumed = 0): Promise<void> {
    if (!Number.isSafeInteger(creditsConsumed) || creditsConsumed < 0) {
      throw new RangeError('Consumed credits must be a non-negative safe integer.');
    }
    const today = new Date().toISOString().split('T')[0];
    const rowId = usageCounterId(userId, today);
    await ensureUsageCounter(userId, today, model);
    await incrementServerCounter(rowId, 'count', 1);
    if (creditsConsumed) await incrementServerCounter(rowId, 'creditsConsumed', creditsConsumed);
    await updateServerCounter(rowId, { model, updatedAt: new Date().toISOString() });
  },

  async resetToday(userId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const rowId = usageCounterId(userId, today);
    await ensureUsageCounter(userId, today, '');
    await updateServerCounter(rowId, { count: 0, updatedAt: new Date().toISOString() });
  },

  async deleteForUser(userId: string): Promise<void> {
    const rows = await listServerCounters();
    await Promise.all(rows.filter((row) => row.kind === 'usage' && row.userId === userId)
      .map((row) => deleteServerCounter(row.$id)));
  },
};

// Conversation model operations
export const conversationRepo = {
  async listForUser(userId: string): Promise<DbConversation[]> {
    return conversations.list({
      filters: [filter('userId', userId)],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  async findById(id: string): Promise<DbConversation | null> {
    return conversations.get(id);
  },

  async create(data: {
    id: string;
    userId: string;
    title: string;
    model?: string;
  }): Promise<DbConversation> {
    const now = new Date().toISOString();
    const conversation: DbConversation = {
      id: data.id,
      userId: data.userId,
      title: data.title,
      model: data.model || 'cintra-core-v1',
      isPinned: 0,
      createdAt: now,
      updatedAt: now,
    };
    await conversations.create(data.id, {
      userId: conversation.userId,
      title: conversation.title,
      model: conversation.model,
      isPinned: conversation.isPinned,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
    return conversation;
  },

  async rename(id: string, userId: string, title: string): Promise<boolean> {
    return runLocalTransaction(async (transaction) => {
      const conversation = await transaction.get<DbConversation>('conversations', id);
      if (!conversation || conversation.userId !== userId) return false;
      await transaction.update('conversations', id, { title: title.trim(), updatedAt: new Date().toISOString() });
      return true;
    });
  },

  async togglePin(id: string, userId: string): Promise<boolean> {
    return runLocalTransaction(async (transaction) => {
      const conversation = await transaction.get<DbConversation>('conversations', id);
      if (!conversation || conversation.userId !== userId) return false;
      const newPin = Number(conversation.isPinned) === 1 ? 0 : 1;
      await transaction.update('conversations', id, { isPinned: newPin, updatedAt: new Date().toISOString() });
      return true;
    });
  },

  async updateModel(id: string, userId: string, model: string): Promise<boolean> {
    return runLocalTransaction(async (transaction) => {
      const conversation = await transaction.get<DbConversation>('conversations', id);
      if (!conversation || conversation.userId !== userId) return false;
      await transaction.update('conversations', id, { model, updatedAt: new Date().toISOString() });
      return true;
    });
  },

  async delete(id: string, userId: string): Promise<boolean> {
    const ownedConversation = await this.findById(id);
    if (!ownedConversation || ownedConversation.userId !== userId) return false;
    await deleteConversationTree(id);
    return true;
  },
};

// Message model operations
export const messageRepo = {
  async listForConversation(conversationId: string): Promise<DbMessage[]> {
    return messages.list({
      filters: [filter('conversationId', conversationId)],
      orderBy: [{ field: 'createdAt', direction: 'asc' }],
    });
  },

  async listContextForConversation(
    conversationId: string,
    beforeMessage?: Pick<DbMessage, 'id' | 'createdAt'>,
  ): Promise<DbMessage[]> {
    const rows = await messages.list(conversationContextQuery(conversationId, beforeMessage));
    return chronologicalContext(rows);
  },

  async create(data: {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    model?: string | null;
    tokens?: number | null;
  }): Promise<DbMessage> {
    const now = new Date().toISOString();
    const conversation = await conversations.get(data.conversationId);
    if (!conversation) throw new Error('Cannot persist a message without its conversation.');
    await runLocalTransaction(async (transaction) => {
      const currentConversation = await transaction.get<DbConversation>('conversations', data.conversationId);
      if (!currentConversation) throw new Error('Conversation was removed before message persistence.');
      await transaction.create('messages', data.id, {
        userId: currentConversation.userId,
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        tokens: data.tokens || null,
        model: data.model || null,
        createdAt: now,
      });
      await transaction.update('conversations', data.conversationId, { updatedAt: now });
    });
    return {
      id: data.id,
      userId: conversation.userId,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      tokens: data.tokens || null,
      model: data.model || null,
      createdAt: now,
    };
  },

  async deleteLastAssistantMessage(conversationId: string): Promise<boolean> {
    const rows = await messages.list({
      filters: [filter('conversationId', conversationId), filter('role', 'assistant')],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit: 1,
    });
    if (!rows.length) return false;
    const messageIds = rows.map(({ id }) => id);
    const children = await Promise.all([
      deleteChildrenForMessages('Feedback', messageIds),
      deleteChildrenForMessages('Attachment', messageIds),
      deleteChildrenForMessages('MessageAudio', messageIds),
      deleteChildrenForMessages('StudyNote', messageIds),
      deleteChildrenForMessages('StudyArtifact', messageIds),
    ]);
    for (const [index, collection] of [
      'Feedback', 'Attachment', 'MessageAudio', 'StudyNote', 'StudyArtifact',
    ].entries()) {
      if (collection === 'Attachment' || collection === 'MessageAudio') {
        await deleteFiles(children[index]);
      }
      await deleteRows(collection as 'Feedback' | 'Attachment' | 'MessageAudio' | 'StudyNote' | 'StudyArtifact', children[index]);
    }
    await deleteRows('Message', rows);
    return true;
  },

  async editUserMessagePreservingHistory(
    conversationId: string,
    messageId: string,
    content: string,
    tokens: number,
    model: string,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    return runLocalTransaction(async (transaction) => {
      const target = await transaction.get<DbMessage>('messages', messageId);
      const conversation = await transaction.get<DbConversation>('conversations', conversationId);
      if (!target || target.conversationId !== conversationId || target.role !== 'user' || !conversation) return false;
      await transaction.update('messages', messageId, { content, tokens, model, editedAt: now });
      await transaction.update('conversations', conversationId, { updatedAt: now });
      return true;
    });
  },
};

// SharedLink operations
export const sharedLinkRepo = {
  async createOrGet(conversationId: string): Promise<string> {
    const conversation = await conversationRepo.findById(conversationId);
    if (!conversation) throw new Error('Cannot share a missing conversation.');
    const existing = await sharedLinks.list({
      filters: [filter('conversationId', conversationId), filter('isRevoked', 0)],
      limit: 1,
    });
    if (existing.length > 0) return String(existing[0].shareToken);

    const shareToken = randomBytes(24).toString('base64url');
    const id = `link_${randomBytes(16).toString('hex')}`;
    const now = new Date().toISOString();
    await sharedLinks.create(id, {
      userId: conversation.userId,
      conversationId,
      shareToken,
      isRevoked: 0,
      views: 0,
      createdAt: now,
      updatedAt: now,
    });
    return shareToken;
  },

  async findByToken(token: string): Promise<{ conversation: DbConversation; messages: DbMessage[] } | null> {
    const matchingLinks = await sharedLinks.list({
      filters: [filter('shareToken', token), filter('isRevoked', 0)],
      limit: 1,
    });
    if (!matchingLinks.length) return null;

    const link = matchingLinks[0];
    const convId = String(link.conversationId);
    const conv = await conversationRepo.findById(convId);
    if (!conv) return null;

    await sharedLinks.increment(link.id, { views: 1 });
    const conversationMessages = await messageRepo.listForConversation(convId);
    return { conversation: conv, messages: conversationMessages };
  },
};

// Feedback operations
type FeedbackRating = 'like' | 'dislike' | 'heart' | 'laugh' | 'thumbs_up' | 'celebrate' | 'thinking' | 'clap';
export const feedbackRepo = {
  async save(userId: string, messageId: string, rating: FeedbackRating, comment?: string): Promise<void> {
    const id = `fb_${randomUUID()}`;
    await feedback.create(id, {
      userId,
      messageId,
      rating,
      comment: comment || null,
      createdAt: new Date().toISOString(),
    });
  },
};
