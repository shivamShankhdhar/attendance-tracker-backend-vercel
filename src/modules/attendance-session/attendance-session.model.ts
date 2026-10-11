import { prisma } from '../../config/database';
import { createDocProxy, toId, SingleQueryBuilder } from '../../config/prisma-compat';

export interface IAttendanceSession {
  _id: any;
  id: string;
  workplaceId: any;
  createdBy: any;
  attendanceDate: string; // 'YYYY-MM-DD'
  qrTokenHash: string;
  encryptedQrToken: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<IAttendanceSession>;
}

function wrapSession(s: any): IAttendanceSession | null {
  if (!s) return null;
  return createDocProxy<any>(
    {
      ...s,
      _id: s.id,
      workplaceId: s.workplaceId,
      createdBy: s.createdById || s.createdBy,
    },
    async (curr) => {
      const updated = await prisma.attendanceSession.update({
        where: { id: curr.id },
        data: {
          status: curr.status,
          qrTokenHash: curr.qrTokenHash,
          encryptedQrToken: curr.encryptedQrToken,
          openedAt: curr.openedAt,
          expiresAt: curr.expiresAt,
        },
      });
      return wrapSession(updated);
    }
  ) as IAttendanceSession;
}

export const AttendanceSessionModel = {
  findById(id: any): SingleQueryBuilder<IAttendanceSession> {
    return new SingleQueryBuilder<IAttendanceSession>(async () => {
      const rawId = toId(id);
      if (!rawId) return null;
      const session = await prisma.attendanceSession.findUnique({ where: { id: rawId } });
      return wrapSession(session);
    });
  },

  findOne(filter: any): SingleQueryBuilder<IAttendanceSession> {
    return new SingleQueryBuilder<IAttendanceSession>(async () => {
      const where: any = {};
      if (filter._id) where.id = toId(filter._id);
      if (filter.id) where.id = toId(filter.id);
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.attendanceDate) where.attendanceDate = filter.attendanceDate;
      if (filter.qrTokenHash) where.qrTokenHash = filter.qrTokenHash;
      if (filter.status) where.status = filter.status;

      const session = await prisma.attendanceSession.findFirst({ where });
      return wrapSession(session);
    });
  },

  async create(data: any): Promise<IAttendanceSession> {
    const created = await prisma.attendanceSession.create({
      data: {
        ...(data._id ? { id: toId(data._id) } : {}),
        workplaceId: toId(data.workplaceId),
        createdById: toId(data.createdBy),
        attendanceDate: data.attendanceDate,
        qrTokenHash: data.qrTokenHash,
        encryptedQrToken: data.encryptedQrToken,
        status: data.status || 'OPEN',
        openedAt: data.openedAt || new Date(),
        expiresAt: data.expiresAt,
      },
    });
    return wrapSession(created)!;
  },

  async deleteOne(filter: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    const existing = await prisma.attendanceSession.findFirst({ where });
    if (!existing) return { deletedCount: 0 };
    await prisma.attendanceSession.delete({ where: { id: existing.id } });
    return { deletedCount: 1 };
  },
};
