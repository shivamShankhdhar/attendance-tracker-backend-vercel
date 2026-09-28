import { Schema, model, Document, Types } from 'mongoose';

export interface IAttendanceSession extends Document {
  _id: Types.ObjectId;
  workplaceId: Types.ObjectId;
  createdBy: Types.ObjectId;
  attendanceDate: string; // 'YYYY-MM-DD'
  qrTokenHash: string; // SHA-256 for fast lookups
  encryptedQrToken: string; // AES-256-GCM to re-show same QR
  status: 'OPEN' | 'CLOSED';
  openedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSessionSchema = new Schema<IAttendanceSession>(
  {
    workplaceId: { type: Schema.Types.ObjectId, ref: 'Workplace', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attendanceDate: { type: String, required: true, index: true },
    qrTokenHash: { type: String, required: true, unique: true, index: true },
    encryptedQrToken: { type: String, required: true },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', required: true },
    openedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

// One session per workplace per attendance date
attendanceSessionSchema.index({ workplaceId: 1, attendanceDate: 1 }, { unique: true });

export const AttendanceSessionModel = model<IAttendanceSession>('AttendanceSession', attendanceSessionSchema);
