import { Router, Request, Response, NextFunction } from 'express';
import { notificationService } from './notification.service';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

export const notificationRouter = Router();

// Protected trigger for processing notification outbox (e.g. Vercel cron or admin trigger)
notificationRouter.post(
  '/notifications/process-outbox',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = req.headers['x-retry-secret'] || req.query.secret;
      if (secret !== env.RETRY_SECRET && env.NODE_ENV === 'production') {
        throw new AppError('Unauthorized trigger', 401, 'UNAUTHORIZED');
      }

      const result = await notificationService.processPendingOutbox();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);
