import { NotificationOutboxModel, INotificationOutbox } from './notification.model';
import { UserModel } from '../auth/user.model';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export class NotificationService {
  /**
   * Process pending push notifications in outbox and deliver via Expo Push API
   */
  async processPendingOutbox(limit: number = 25): Promise<{ processed: number; sent: number; failed: number }> {
    const now = new Date();

    const pendingJobs = await NotificationOutboxModel.find({
      status: 'PENDING',
      nextAttemptAt: { $lte: now },
      attempts: { $lt: 5 },
    }).limit(limit);

    if (pendingJobs.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const job of pendingJobs) {
      try {
        const recipient = await UserModel.findById(job.recipientId);

        if (!recipient || !recipient.expoPushToken) {
          // No push token registered on recipient device yet; mark completed without error
          job.status = 'SENT';
          job.lastError = 'No expoPushToken registered for user';
          await job.save();
          sent++;
          continue;
        }

        const pushPayload = {
          to: recipient.expoPushToken,
          sound: 'default',
          title: job.title,
          body: job.body,
          data: job.data || {},
        };

        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(pushPayload),
        });

        if (response.ok) {
          job.status = 'SENT';
          job.attempts += 1;
          await job.save();
          sent++;
        } else {
          const errText = await response.text();
          job.attempts += 1;
          job.lastError = errText;
          // Exponential backoff: 1min, 5min, 15min, 1hr
          const delayMinutes = Math.pow(job.attempts, 2) * 2;
          job.nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000);
          if (job.attempts >= 5) {
            job.status = 'FAILED';
          }
          await job.save();
          failed++;
        }
      } catch (err: any) {
        job.attempts += 1;
        job.lastError = err.message;
        job.nextAttemptAt = new Date(Date.now() + 5 * 60 * 1000);
        if (job.attempts >= 5) {
          job.status = 'FAILED';
        }
        await job.save();
        failed++;
      }
    }

    return { processed: pendingJobs.length, sent, failed };
  }
}

export const notificationService = new NotificationService();
