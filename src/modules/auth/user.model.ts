import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  googleSub?: string;
  status: 'ACTIVE' | 'INACTIVE';
  tokenVersion: number;
  expoPushToken?: string;
  mpinHash?: string;
  mpinFailedAttempts?: number;
  mpinLockedUntil?: Date | null;
  mpinAttemptVersion?: number;
  hasMpin?: boolean;
  biometricEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      index: { unique: true, sparse: true },
    },
    phone: {
      type: String,
      trim: true,
      index: { unique: true, sparse: true },
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    googleSub: {
      type: String,
      trim: true,
      index: { unique: true, sparse: true },
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      required: true,
    },
    tokenVersion: {
      type: Number,
      default: 1,
      required: true,
    },
    expoPushToken: {
      type: String,
      trim: true,
    },
    mpinHash: {
      type: String,
    },
    mpinFailedAttempts: { type: Number, default: 0 },
    mpinLockedUntil: { type: Date, default: null },
    mpinAttemptVersion: { type: Number, default: 0 },
    hasMpin: {
      type: Boolean,
      default: false,
    },
    biometricEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const UserModel = model<IUser>('User', userSchema);
