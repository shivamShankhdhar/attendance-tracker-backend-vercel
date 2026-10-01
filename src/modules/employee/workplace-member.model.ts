import { Schema, model, Document, Types } from 'mongoose';

export interface IWorkplaceMember extends Document {
  _id: Types.ObjectId;
  workplaceId: Types.ObjectId;
  userId?: Types.ObjectId;
  role: 'EMPLOYER' | 'EMPLOYEE';
  name: string;
  employeeCode?: string;
  invitedEmail?: string;
  pinHash?: string;
  status: 'INVITED' | 'ACTIVE' | 'INACTIVE';
  invitationCode?: string;
  invitationTokenHash?: string;
  invitationExpiresAt?: Date;
  joinedAt?: Date;
  lastWifiSeenAt?: Date;
  lastConnectedSsid?: string;
  createdAt: Date;
  updatedAt: Date;
}

const workplaceMemberSchema = new Schema<IWorkplaceMember>(
  {
    workplaceId: { type: Schema.Types.ObjectId, ref: 'Workplace', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    role: { type: String, enum: ['EMPLOYER', 'EMPLOYEE'], required: true },
    name: { type: String, required: true, trim: true },
    employeeCode: { type: String, trim: true, uppercase: true },
    invitedEmail: { type: String, trim: true, lowercase: true },
    pinHash: { type: String },
    status: {
      type: String,
      enum: ['INVITED', 'ACTIVE', 'INACTIVE'],
      default: 'INVITED',
      required: true,
      index: true,
    },
    invitationCode: { type: String, index: { unique: true, sparse: true }, lowercase: true, trim: true },
    invitationTokenHash: { type: String, index: { unique: true, sparse: true } },
    invitationExpiresAt: { type: Date },
    joinedAt: { type: Date },
    lastWifiSeenAt: { type: Date },
    lastConnectedSsid: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

// Indexes:
// 1. One membership per user per workplace (sparse for invited members where userId is not yet bound)
workplaceMemberSchema.index(
  { workplaceId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true, $type: 'objectId' } } }
);

// 2. One invitation per email per workplace
workplaceMemberSchema.index(
  { workplaceId: 1, invitedEmail: 1 },
  { unique: true, partialFilterExpression: { invitedEmail: { $exists: true, $type: 'string' } } }
);

// 3. Unique employeeCode per workplace
workplaceMemberSchema.index(
  { workplaceId: 1, employeeCode: 1 },
  { unique: true, partialFilterExpression: { employeeCode: { $exists: true, $type: 'string' } } }
);

export const WorkplaceMemberModel = model<IWorkplaceMember>('WorkplaceMember', workplaceMemberSchema);
