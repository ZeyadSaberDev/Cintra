import { createHmac } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';

type EmailOtpTransport = Transporter;

let cachedTransport: EmailOtpTransport | undefined;

export interface EmailOtpChallenge {
  uid: string;
  codeHash: string;
  expiresAtMs: number;
  attempts: number;
}

export type EmailOtpAttempt =
  | { status: 'success'; uid: string }
  | { status: 'invalid'; attempts: number }
  | { status: 'expired' | 'rate-limited' };

export function emailOtpDigest(email: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`${email}\0${code}`).digest('hex');
}

export function evaluateEmailOtpAttempt(
  challenge: EmailOtpChallenge,
  submittedHash: string,
  now: number,
): EmailOtpAttempt {
  if (challenge.expiresAtMs <= now) return { status: 'expired' };
  if (challenge.attempts >= 5) return { status: 'rate-limited' };
  if (challenge.codeHash !== submittedHash) {
    const attempts = challenge.attempts + 1;
    return attempts >= 5 ? { status: 'rate-limited' } : { status: 'invalid', attempts };
  }
  return { status: 'success', uid: challenge.uid };
}

function smtpConfiguration() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from) {
    return null;
  }
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE?.trim().toLowerCase() === 'true' || port === 465,
    auth: { user, pass: password },
    from,
  };
}

export function isEmailOtpMailConfigured(): boolean {
  return smtpConfiguration() !== null;
}

export async function sendEmailLoginCode(email: string, code: string): Promise<void> {
  const config = smtpConfiguration();
  if (!config) {
    throw new Error('Email OTP SMTP configuration is incomplete.');
  }
  cachedTransport ||= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
  await cachedTransport.sendMail({
    from: config.from,
    to: email,
    subject: 'Your Cintra sign-in code',
    text: `Your Cintra sign-in code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
    html: `<p>Your Cintra sign-in code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
  });
}

export async function sendPasswordResetLink(email: string, url: string): Promise<void> {
  const config = smtpConfiguration();
  if (!config) throw new Error('Password reset email SMTP configuration is incomplete.');
  cachedTransport ||= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
  const safeUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  await cachedTransport.sendMail({
    from: config.from,
    to: email,
    subject: 'Reset your Cintra password',
    text: `Use this link to reset your Cintra password. It expires in 30 minutes: ${url}`,
    html: `<p>Use this link to reset your Cintra password. It expires in 30 minutes.</p><p><a href="${safeUrl}">Reset password</a></p>`,
  });
}
