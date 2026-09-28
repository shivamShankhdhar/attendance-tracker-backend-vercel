import { Schema, model, Document, Types } from 'mongoose';

export interface IWorkplace extends Document {
  _id: Types.ObjectId;
  name: string;
  ownerId: Types.ObjectId;
  timezone: string;
  address?: string;
  wifiSsid?: string;
  attendanceSettings: {
    requireWifi: boolean;
    autoCloseHour: number;
  };
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}

const workplaceSchema = new Schema<IWorkplace>(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    timezone: { type: String, default: 'Asia/Kolkata', required: true },
    address: { type: String, trim: true },
    wifiSsid: { type: String, trim: true },
    attendanceSettings: {
      requireWifi: { type: Boolean, default: false },
      autoCloseHour: { type: Number, default: 23 },
    },
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
