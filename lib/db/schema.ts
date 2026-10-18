import { DATA_COLLECTIONS, type DataCollection } from './collections.js';

export type AttributeKind = 'string' | 'longtext' | 'integer' | 'boolean';

export interface CollectionSchema {
  fields: Record<string, AttributeKind>;
  indexes: string[][];
}

const schema = (fields: Record<string, AttributeKind>, indexes: string[][]): CollectionSchema => ({
  fields: { recordKey: 'string', payload: 'longtext', ...fields },
  indexes: [['recordKey'], ...indexes],
});

const text: AttributeKind = 'string';
const longtext: AttributeKind = 'longtext';
const integer: AttributeKind = 'integer';
const boolean: AttributeKind = 'boolean';

export const DATA_SCHEMA: Record<DataCollection, CollectionSchema> = {
  User: schema({
    authUserId: text, email: text, emailHash: text, createdAt: text, isGuest: boolean, isBanned: boolean, plan: text,
    dailyMessageLimitOverride: integer,
  }, [['authUserId'], ['emailHash'], ['createdAt']]),
  UsageLog: schema({ userId: text, date: text }, [['userId', 'date'], ['userId']]),
  Conversation: schema({ userId: text, createdAt: text, updatedAt: text }, [['userId'], ['userId', 'createdAt']]),
  Message: schema({ userId: text, conversationId: text, createdAt: text, role: text, content: longtext }, [
    ['conversationId'], ['conversationId', 'createdAt'], ['userId'],
  ]),
  MessageAudio: schema({ userId: text, messageId: text, fileUrl: text }, [['userId'], ['messageId']]),
  Attachment: schema({ userId: text, messageId: text, fileUrl: text }, [['userId'], ['messageId']]),
  Feedback: schema({ userId: text, messageId: text, createdAt: text }, [['userId'], ['messageId']]),
  StudyNote: schema({ userId: text, messageId: text, createdAt: text }, [['userId'], ['messageId', 'createdAt']]),
  StudyArtifact: schema({ userId: text, messageId: text, kind: text, createdAt: text }, [['userId'], ['messageId', 'createdAt']]),
  PDFDocument: schema({ userId: text, conversationId: text, createdAt: text, fileUrl: text, extractedText: longtext }, [
    ['userId'], ['conversationId'], ['userId', 'createdAt'],
  ]),
  PDFOperation: schema({ userId: text, pdfId: text, createdAt: text }, [['userId'], ['pdfId']]),
  Agent: schema({ userId: text, createdAt: text }, [['userId'], ['userId', 'createdAt']]),
  AgentAction: schema({ userId: text, agentId: text, createdAt: text }, [['userId'], ['agentId']]),
  AgentApproval: schema({ userId: text, agentId: text, createdAt: text, statusText: text }, [['userId'], ['agentId']]),
  Subscription: schema({
    userId: text, statusText: text, stripeSubscriptionId: text, stripeCustomerId: text, createdAt: text, updatedAt: text,
  }, [['userId'], ['stripeSubscriptionId'], ['stripeCustomerId'], ['userId', 'updatedAt']]),
  Payment: schema({ userId: text, statusText: text, createdAt: text }, [['userId'], ['userId', 'createdAt']]),
  ProcessedStripeEvent: schema({ eventId: text, createdAt: text }, [['eventId']]),
  PendingUpload: schema({ userId: text, expiresAt: text, fileUrl: text }, [['userId'], ['userId', 'expiresAt']]),
  SharedLink: schema({ userId: text, conversationId: text, shareToken: text, isRevoked: boolean }, [
    ['userId'], ['conversationId'], ['shareToken'],
  ]),
  APIConfiguration: schema({ provider: text, isActive: boolean, priority: integer }, [['isActive', 'priority']]),
  APIQuota: schema({ apiId: text, resetDate: text }, [['apiId']]),
  APIQuotaUsage: schema({ apiId: text, usageDate: text, usageCount: integer }, [['apiId', 'usageDate']]),
  APILog: schema({ apiId: text, createdAt: text, statusNumber: integer }, [['apiId'], ['apiId', 'createdAt']]),
  ModelConfig: schema({ apiId: text, apiModelId: text, isEnabled: boolean, createdAt: text }, [['apiId'], ['isEnabled']]),
  AdminLog: schema({ adminId: text, action: text, timestamp: text }, [['adminId'], ['timestamp']]),
  AdminSetting: schema({ key: text }, [['key']]),
  ApiRequestLog: schema({
    userId: text, apiId: text, endpoint: text, method: text, statusNumber: integer, createdAt: text,
  }, [['userId'], ['createdAt'], ['statusNumber']]),
  UserEventLog: schema({ userId: text, event: text, createdAt: text }, [['userId'], ['event'], ['createdAt']]),
  SystemLog: schema({ level: text, createdAt: text }, [['level'], ['createdAt']]),
  BackupLog: schema({ createdAt: text }, [['createdAt']]),
  Account: schema({ userId: text, email: text, emailHash: text }, [['userId'], ['emailHash']]),
  Session: schema({ userId: text, createdAt: text }, [['userId'], ['createdAt']]),
  PasswordReset: schema({ userId: text, email: text }, [['userId'], ['email']]),
  AdminUser: schema({ email: text, isActive: boolean }, [['email']]),
  AdminSession: schema({ adminId: text, createdAt: text }, [['adminId'], ['createdAt']]),
  AdminAllowlist: schema({ email: text, isActive: boolean, createdAt: text }, [['email'], ['isActive']]),
  Announcement: schema({ isActive: boolean, createdAt: text, expiresAt: text }, [['isActive'], ['expiresAt']]),
  GuestDevice: schema({ userId: text }, [['userId']]),
  EmailOtp: schema({
    email: text, challengeId: text, uid: text, sentAtMs: integer, expiresAtMs: integer, attempts: integer,
  }, [['email']]),
};

export const DATA_SCHEMA_COLLECTIONS = Object.entries(DATA_COLLECTIONS).map(([key, id]) => ({
  key: key as DataCollection,
  id,
  schema: DATA_SCHEMA[key as DataCollection],
}));
