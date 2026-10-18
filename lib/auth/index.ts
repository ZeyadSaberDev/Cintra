import { z } from 'zod';
import { DbUser } from '../db/index.js';

export const SignupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60).optional().nullable(),
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  languagePreference: z.enum(['auto', 'ar', 'en']).optional(),
});

export const LoginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

export const ResetPasswordSchema = z.object({
  userId: z.string().min(1, 'Reset user is required'),
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  languagePreference: z.enum(['auto', 'ar', 'en']).optional(),
  customInstructions: z.string().max(2000).optional().nullable(),
  tone: z.enum(['Formal', 'Conversational', 'Creative', 'Academic', 'Professional']).optional(),
  responseLength: z.enum(['Brief', 'Normal', 'Detailed']).optional(),
  writingStyle: z.enum(['Simple', 'Technical', 'Poetic', 'Casual']).optional(),
  languageVariant: z.enum([
    'Modern Standard Arabic (الفصحى)',
    'Egyptian Arabic (المصرية)',
    'Gulf Arabic (الخليجية)',
    'Levantine Arabic (الشامية)',
    'Moroccan Arabic (المغربية)',
    'American English',
    'British English',
    'Australian English',
  ]).optional().nullable(),
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  studyModeEnabled: z.boolean().optional(),
  highlightUserMessages: z.boolean().optional(),
  highlightAssistantAnswers: z.boolean().optional(),
  userMessageHighlightColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  assistantAnswerHighlightColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  voiceEnabled: z.boolean().optional(),
  ttsVoice: z.string().trim().max(255).optional(),
  ttsSpeed: z.union([z.literal(0.5), z.literal(1), z.literal(1.5), z.literal(2)]).optional(),
  preferredLanguage: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Z0-9]{2,8})?$/).max(24).optional(),
});

export function sanitizeUser(user: DbUser) {
  const {
    authUserId: _authUserId,
    dailyMessageLimit: _dailyMessageLimit,
    stripeCustomerId: _stripeCustomerId,
    role: _role,
    isBanned: _isBanned,
    ...safeUser
  } = user;
  return {
    ...safeUser,
    isGuest: Boolean(user.isGuest),
    creditBalance: Number(user.creditBalance || 0),
    studyModeEnabled: Boolean(user.studyModeEnabled),
    highlightUserMessages: user.highlightUserMessages === undefined ? true : Boolean(user.highlightUserMessages),
    highlightAssistantAnswers: user.highlightAssistantAnswers === undefined ? true : Boolean(user.highlightAssistantAnswers),
    userMessageHighlightColor: /^#[0-9A-Fa-f]{6}$/.test(user.userMessageHighlightColor || '')
      ? user.userMessageHighlightColor
      : '#818cf8',
    assistantAnswerHighlightColor: /^#[0-9A-Fa-f]{6}$/.test(user.assistantAnswerHighlightColor || '')
      ? user.assistantAnswerHighlightColor
      : '#fbbf24',
    voiceEnabled: Boolean(user.voiceEnabled),
  };
}
