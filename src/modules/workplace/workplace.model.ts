import { Schema, model, Document, Types } from 'mongoose';

export interface IWorkplace extends Document {
  _id: Types.ObjectId;
  name: string;
  ownerId: Types.ObjectId;
  timezone: string;
  address?: string;
  description?: string;
  joinInviteToken?: string;
  previousJoinTokens?: string[];
  joinShareUrl?: string;
  wifiSsid?: string;
  attendanceSettings: {
    requireWifi: boolean;
    autoCloseHour: number;
    allowEmployeeViewHistory?: boolean;
  };
  status: 'ACTIVE' | 'INACTIVE';
  joinQrSecret?: string;
  joinQrEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const workplaceSchema = new Schema<IWorkplace>(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    timezone: { type: String, default: 'Asia/Kolkata', required: true },
    address: { type: String, trim: true },
    description: { type: String, trim: true, maxlength: 300 },
    joinInviteToken: { type: String, unique: true, sparse: true },
    previousJoinTokens: [{ type: String }],
    joinShareUrl: { type: String },
    wifiSsid: { type: String, trim: true },
    attendanceSettings: {
      requireWifi: { type: Boolean, default: false },
      autoCloseHour: { type: Number, default: 23 },
      allowEmployeeViewHistory: { type: Boolean, default: true },
    },
    joinQrSecret: { type: String },
    joinQrEnabled: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const WorkplaceModel = model<IWorkplace>('Workplace', workplaceSchema);
