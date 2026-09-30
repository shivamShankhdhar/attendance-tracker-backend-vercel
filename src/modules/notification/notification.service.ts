import { NotificationOutboxModel } from './notification.model';
import { UserModel } from '../auth/user.model';

export class NotificationService {
  /** Claim jobs with a lease so concurrent workers do not send the same event. */
  async processPendingOutbox(limit = 25, requestId?: string): Promise<{ processed: number; sent: number; failed: number }> {
    let processed = 0, sent = 0, failed = 0;
    for (let i = 0; i < limit; i++) {
      const job = await NotificationOutboxModel.findOneAndUpdate({
        status: 'PENDING', nextAttemptAt: { $lte: new Date() }, attempts: { $lt: 5 },
        ...(requestId ? { eventId: { $in: ['pending', 'approved', 'rejected'].map((status) => `join:${requestId}:${status}`) } } : {}),
      }, { $set: { nextAttemptAt: new Date(Date.now() + 60_000) } }, { new: true, sort: { createdAt: 1 } });
      if (!job) break;
      processed++;
      try {
        const recipient = await UserModel.findById(job.recipientId);
        if (!recipient?.expoPushToken) {
          // Keep the event for a later registration, instead of falsely marking it sent.
          job.nextAttemptAt = new Date(Date.now() + 30 * 60_000);
          job.lastError = 'Waiting for device notification registration';
          await job.save();
          continue;
        }
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST', signal: AbortSignal.timeout(5000),
          headers: { 'Content-Type': 'application/json', Accept: 'application/json',
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
          body: JSON.stringify({ to: recipient.expoPushToken, sound: 'default', title: job.title, body: job.body, data: job.data || {} }),
        });
        const result = await response.json() as { data?: { status?: string; message?: string; details?: { error?: string } } };
        if (!response.ok || result.data?.status !== 'ok') {
          if (result.data?.details?.error === 'DeviceNotRegistered') {
            await UserModel.updateOne({ _id: recipient._id, expoPushToken: recipient.expoPushToken }, { $unset: { expoPushToken: 1 } });
          }
          throw new Error(result.data?.message || `Push delivery failed (${response.status})`);
        }
        job.status = 'SENT'; job.attempts++; job.lastError = undefined;
        await job.save(); sent++;
      } catch (error) {
        job.attempts++;
        job.lastError = error instanceof Error ? error.message : 'Push delivery failed';
        job.nextAttemptAt = new Date(Date.now() + job.attempts ** 2 * 120_000);
        if (job.attempts >= 5) job.status = 'FAILED';
        await job.save(); failed++;
      }
    }
    return { processed, sent, failed };
  }
}
export const notificationService = new NotificationService();
