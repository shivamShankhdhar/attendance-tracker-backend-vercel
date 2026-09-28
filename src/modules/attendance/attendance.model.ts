import { Schema, model, Document, Types } from 'mongoose';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';
export type AttendanceSource = 'QR_REQUEST' | 'MANUAL';

export interface IAttendance extends Document {
  _id: Types.ObjectId;
  workplaceId: Types.ObjectId;
  employeeMemberId: Types.ObjectId;
  userId?: Types.ObjectId;
  attendanceDate: string; // 'YYYY-MM-DD'
  status: AttendanceStatus;
  checkInTime?: Date;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  source: AttendanceSource;
  attendanceRequestId?: Types.ObjectId;
  verification: {
    qr: boolean;
    wifi: boolean | null;
  };
  correctionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    workplaceId: { type: Schema.Types.ObjectId, ref: 'Workplace', required: true, index: true },
    employeeMemberId: { type: Schema.Types.ObjectId, ref: 'WorkplaceMember', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    attendanceDate: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'],
      default: 'PRESENT',
      required: true,
      index: true,
    },
    checkInTime: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    source: {
      type: String,
      enum: ['QR_REQUEST', 'MANUAL'],
      default: 'QR_REQUEST',
      required: true,
    },
    attendanceRequestId: { type: Schema.Types.ObjectId, ref: 'AttendanceRequest' },
    verification: {
      qr: { type: Boolean, default: false },
      wifi: { type: Boolean, default: null },
    },
    correctionReason: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

// Rule 2 & Section 14: Unique compound index guaranteeing only ONE attendance record per employee per workplace per attendance date
attendanceSchema.index(
  { workplaceId: 1, employeeMemberId: 1, attendanceDate: 1 },
  { unique: true }
);

// Index for reporting and date range filters
attendanceSchema.index({ workplaceId: 1, attendanceDate: 1, status: 1 });
attendanceSchema.index({ employeeMemberId: 1, attendanceDate: -1 });

export const AttendanceModel = model<IAttendance>('Attendance', attendanceSchema);
