import { Schema, model, Document, Types } from 'mongoose';

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface IWorkplaceJoinRequest extends Document {
  _id: Types.ObjectId;
  workplaceId: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  email?: string;
  employeeCode?: string;
  avatarUrl?: string;
  note?: string;
  status: JoinRequestStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const workplaceJoinRequestSchema = new Schema<IWorkplaceJoinRequest>(
  {
    workplaceId: { type: Schema.Types.ObjectId, ref: 'Workplace', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    employeeCode: { type: String, trim: true, uppercase: true },
    avatarUrl: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 200 },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 300 },
  },
  {
    timestamps: true,
  }
);

// Indexes
workplaceJoinRequestSchema.index({ workplaceId: 1, status: 1, createdAt: -1 });
workplaceJoinRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Ensure one pending request per user per workplace
workplaceJoinRequestSchema.index(
  { workplaceId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);
// Ensure one pending request per employeeCode per workplace
workplaceJoinRequestSchema.index(
  { workplaceId: 1, employeeCode: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING', employeeCode: { $exists: true, $type: 'string' } } }
);

export const WorkplaceJoinRequestModel = model<IWorkplaceJoinRequest>(
  'WorkplaceJoinRequest',
  workplaceJoinRequestSchema
);
