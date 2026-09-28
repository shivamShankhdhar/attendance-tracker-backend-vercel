import { Schema, model, Document, Types } from 'mongoose';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface IAttendanceRequest extends Document {
  _id: Types.ObjectId;
  workplaceId: Types.ObjectId;
  attendanceSessionId: Types.ObjectId;
  employeeMemberId: Types.ObjectId;
  userId: Types.ObjectId;
  attendanceDate: string; // 'YYYY-MM-DD'
  requestedAt: Date;
  verification: {
    qrVerified: boolean;
    wifiVerified: boolean | null;
    deviceSsid?: string;
  };
  status: RequestStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceRequestSchema = new Schema<IAttendanceRequest>(
  {
    workplaceId: { type: Schema.Types.ObjectId, ref: 'Workplace', required: true, index: true },
    attendanceSessionId: { type: Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
    employeeMemberId: { type: Schema.Types.ObjectId, ref: 'WorkplaceMember', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    attendanceDate: { type: String, required: true, index: true },
    requestedAt: { type: Date, required: true },
    verification: {
      qrVerified: { type: Boolean, default: true, required: true },
      wifiVerified: { type: Boolean, default: null },
      deviceSsid: { type: String },
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: one request per employee per workplace per date
attendanceRequestSchema.index(
  { workplaceId: 1, employeeMemberId: 1, attendanceDate: 1 },
  { unique: true }
);

// Index for employer queries (fetching pending requests fast)
attendanceRequestSchema.index({ workplaceId: 1, status: 1, requestedAt: -1 });

export const AttendanceRequestModel = model<IAttendanceRequest>('AttendanceRequest', attendanceRequestSchema);
