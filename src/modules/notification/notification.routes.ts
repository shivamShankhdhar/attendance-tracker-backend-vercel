import { Router, Request, Response, NextFunction } from 'express';
import { notificationService } from './notification.service';
import { NotificationOutboxModel } from './notification.model';
import { authenticate } from '../../middleware/authenticate';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

export const notificationRouter = Router();

// Get real notifications for authenticated user
notificationRouter.get(
  '/notifications/my',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      }

      const notifications = await NotificationOutboxModel.find({
        recipientId: userId,
      })
        .sort({ createdAt: -1 })
        .limit(40);

      res.status(200).json({
        success: true,
        data: notifications.map((n) => ({
          id: n._id.toString(),
          title: n.title,
          body: n.body,
          type:
            n.kind === 'ATTENDANCE_REQUESTED'
              ? 'REQUEST'
              : n.kind === 'ATTENDANCE_APPROVED'
              ? 'ATTENDANCE'
              : n.kind === 'ATTENDANCE_REJECTED'
              ? 'REQUEST'
              : n.kind === 'JOIN_REQUESTED'
              ? 'SYSTEM'
              : 'INFO',
          timestamp: (n as any).createdAt?.toISOString?.() || new Date().toISOString(),
          read: n.status === 'SENT',
          data: n.data,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

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
