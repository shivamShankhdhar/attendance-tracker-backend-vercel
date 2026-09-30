import { Schema, model, Document, Types } from 'mongoose';

export interface IMpinOtp extends Document {
  userId: Types.ObjectId;
  email: string;
  otpHash: string;
  purpose: 'RESET_MPIN' | 'CHANGE_MPIN';
  resetToken?: string;
  isVerified: boolean;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const mpinOtpSchema = new Schema<IMpinOtp>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ['RESET_MPIN', 'CHANGE_MPIN'],
      required: true,
    },
    resetToken: {
      type: String,
      sparse: true,
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  }
);

export const MpinOtpModel = model<IMpinOtp>('MpinOtp', mpinOtpSchema);
