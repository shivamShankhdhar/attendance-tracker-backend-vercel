import { Schema, model, Document, Types } from 'mongoose';

export type NotificationKind =
  | 'ATTENDANCE_REQUESTED'
  | 'ATTENDANCE_APPROVED'
  | 'ATTENDANCE_REJECTED'
  | 'INVITATION_RECEIVED';

export interface INotificationOutbox extends Document {
  _id: Types.ObjectId;
  eventId: string; // unique deduplication key
  recipientId: Types.ObjectId;
  workplaceId: Types.ObjectId;
  kind: NotificationKind;
  title: string;
  body: string;
  data?: Record<string, any>;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  nextAttemptAt: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationOutboxSchema = new Schema<INotificationOutbox>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workplaceId: { type: Schema.Types.ObjectId, ref: 'Workplace', required: true },
    kind: {
      type: String,
      enum: ['ATTENDANCE_REQUESTED', 'ATTENDANCE_APPROVED', 'ATTENDANCE_REJECTED', 'INVITATION_RECEIVED'],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING', index: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lastError: { type: String },
  },
  {
    timestamps: true,
  }
);

export const NotificationOutboxModel = model<INotificationOutbox>('NotificationOutbox', notificationOutboxSchema);
