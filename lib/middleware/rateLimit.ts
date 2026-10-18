import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipMap = new Map<string, RateLimitRecord>();
const userMap = new Map<string, RateLimitRecord>();
let nextLimiterId = 0;

// Clean up expired records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of ipMap.entries()) {
    if (now > record.resetTime) ipMap.delete(key);
  }
  for (const [key, record] of userMap.entries()) {
    if (now > record.resetTime) userMap.delete(key);
  }
}, 300000);

/**
 * Express middleware for IP and user-level rate limiting
 */
export function rateLimiter({
  windowMs = 60000, // 1 minute
  maxRequests = 60, // 60 requests per minute
  message = 'Too many requests, please slow down.',
  messageAr = 'طلبات كثيرة جداً، يرجى الانتظار قليلاً والمحاولة لاحقاً.',
}: {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  messageAr?: string;
} = {}) {
  const limiterId = nextLimiterId++;
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const ipKey = `${limiterId}:${ip}`;
    const now = Date.now();

    // Check IP
    const record = ipMap.get(ipKey);
    if (!record || now > record.resetTime) {
      ipMap.set(ipKey, { count: 1, resetTime: now + windowMs });
    } else {
      record.count += 1;
      if (record.count > maxRequests) {
        return res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message,
            messageAr,
            retryAfter: Math.ceil((record.resetTime - now) / 1000),
          },
        });
      }
    }

    const userId = (req as Request & { user?: { id?: string } }).user?.id;
    if (userId) {
      const userKey = `${limiterId}:${userId}`;
      const userRecord = userMap.get(userKey);
      if (!userRecord || now > userRecord.resetTime) {
        userMap.set(userKey, { count: 1, resetTime: now + windowMs });
      } else {
        userRecord.count += 1;
        if (userRecord.count > maxRequests) {
          return res.status(429).json({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message,
              messageAr,
              retryAfter: Math.ceil((userRecord.resetTime - now) / 1000),
            },
          });
        }
      }
    }

    next();
  };
}
