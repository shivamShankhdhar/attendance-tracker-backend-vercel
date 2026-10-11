import { prisma } from '../../config/database';
import { createDocProxy, toId } from '../../config/prisma-compat';

export interface IMpinOtp {
  _id: any;
  id: string;
  userId: any;
  email: string;
  otpHash: string;
  purpose: 'RESET_MPIN' | 'CHANGE_MPIN';
  resetToken?: string;
  isVerified: boolean;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<IMpinOtp>;
}

function wrapMpinOtp(record: any): IMpinOtp | null {
  if (!record) return null;
  return createDocProxy<any>(
    {
      ...record,
      _id: record.id,
      resetToken: record.resetToken ?? undefined,
    },
    async (curr) => {
      const updated = await prisma.mpinOtp.update({
        where: { id: curr.id },
        data: {
          isVerified: curr.isVerified,
          resetToken: curr.resetToken !== undefined ? curr.resetToken : undefined,
          attempts: curr.attempts,
        },
      });
      return { ...updated, _id: updated.id };
    }
  ) as IMpinOtp;
}

export const MpinOtpModel = {
  async findOne(filter: any): Promise<IMpinOtp | null> {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    if (filter.userId) where.userId = toId(filter.userId);
    if (filter.purpose) where.purpose = filter.purpose;
    if (filter.resetToken) where.resetToken = filter.resetToken;
    if (filter.isVerified !== undefined) where.isVerified = filter.isVerified;

    if (filter.expiresAt && filter.expiresAt.$gt) {
      where.expiresAt = { gt: filter.expiresAt.$gt };
    }
    if (filter.createdAt && filter.createdAt.$gt) {
      where.createdAt = { gt: filter.createdAt.$gt };
    }

    const record = await prisma.mpinOtp.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return wrapMpinOtp(record);
  },

  async create(data: any): Promise<IMpinOtp> {
    const created = await prisma.mpinOtp.create({
      data: {
        userId: toId(data.userId),
        email: data.email.toLowerCase(),
        otpHash: data.otpHash,
        purpose: data.purpose,
        resetToken: data.resetToken || null,
        isVerified: data.isVerified ?? false,
        attempts: data.attempts ?? 0,
        expiresAt: data.expiresAt,
      },
    });
    return wrapMpinOtp(created)!;
  },

  async deleteOne(filter: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    const existing = await prisma.mpinOtp.findFirst({ where });
    if (!existing) return { deletedCount: 0 };
    await prisma.mpinOtp.delete({ where: { id: existing.id } });
    return { deletedCount: 1 };
  },

  async deleteMany(filter: any = {}) {
    const where: any = {};
    if (filter.userId) where.userId = toId(filter.userId);
    if (filter.purpose) where.purpose = filter.purpose;
    const res = await prisma.mpinOtp.deleteMany({ where });
    return { deletedCount: res.count };
  },
};
