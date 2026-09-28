import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

/**
 * Clean up expired rate-limit records periodically (unref so tests exit naturally)
 */
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (record.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 60000);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

export function rateLimiter(options: {
  windowMs: number; // window size in milliseconds
  maxRequests: number; // max requests within window
  keyGenerator?: (req: Request) => string;
  message?: string;
}) {
  const { windowMs, maxRequests, message = 'Too many requests, please try again later.' } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = options.keyGenerator
      ? options.keyGenerator(req)
      : `${req.ip || 'ip'}_${req.baseUrl}${req.path}`;

    const now = Date.now();
    const existing = memoryStore.get(key);

    if (!existing || existing.resetAt <= now) {
      memoryStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (existing.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return next(new AppError(message, 429, 'RATE_LIMIT_EXCEEDED'));
    }

    existing.count += 1;
    next();
  };
}
