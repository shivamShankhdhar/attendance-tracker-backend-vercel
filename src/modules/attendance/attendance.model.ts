import { prisma } from '../../config/database';
import { createDocProxy, toId, createPopulatedRef, QueryBuilder, SingleQueryBuilder } from '../../config/prisma-compat';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';
export type AttendanceSource = 'QR_REQUEST' | 'QR_SCAN' | 'MANUAL' | 'GEOFENCE';

export interface IAttendance {
  _id: any;
  id: string;
  workplaceId: any;
  employeeMemberId: any;
  userId?: any;
  attendanceDate: string; // 'YYYY-MM-DD'
  status: AttendanceStatus;
  checkInTime?: Date;
  checkOutTime?: Date;
  approvedAt?: Date;
  approvedBy?: any;
  source: AttendanceSource;
  attendanceRequestId?: any;
  verification: {
    qr: boolean;
    wifi: boolean | null;
    geofence?: boolean | null;
    distanceMeters?: number;
  };
  correctionReason?: string;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<IAttendance>;
}

function wrapAttendance(a: any): IAttendance | null {
  if (!a) return null;
  const verification = {
    qr: a.qrVerified ?? false,
    wifi: a.wifiVerified ?? null,
    geofence: a.geofenceVerified ?? null,
    distanceMeters: a.distanceMeters ?? undefined,
  };

  return createDocProxy<any>(
    {
      ...a,
      workplaceId: createPopulatedRef(a.workplaceId, a.workplace),
      employeeMemberId: createPopulatedRef(a.employeeMemberId, a.employeeMember),
      userId: createPopulatedRef(a.userId, a.user),
      approvedBy: a.approvedById || a.approvedBy ? createPopulatedRef(a.approvedById, a.approvedBy) : undefined,
      attendanceRequestId: a.attendanceRequestId || a.attendanceRequest ? createPopulatedRef(a.attendanceRequestId, a.attendanceRequest) : undefined,
      checkInTime: a.checkInTime ?? undefined,
      checkOutTime: a.checkOutTime ?? undefined,
      approvedAt: a.approvedAt ?? undefined,
      correctionReason: a.correctionReason ?? undefined,
      verification,
    },
    async (curr) => {
      const v = curr.verification || {};
      const updated = await prisma.attendance.update({
        where: { id: curr.id },
        data: {
          status: curr.status,
          checkInTime: curr.checkInTime || null,
          checkOutTime: curr.checkOutTime || null,
          approvedAt: curr.approvedAt || null,
          approvedById: curr.approvedBy ? toId(curr.approvedBy) : null,
          source: curr.source,
          attendanceRequestId: curr.attendanceRequestId ? toId(curr.attendanceRequestId) : null,
          qrVerified: v.qr ?? false,
          wifiVerified: v.wifi ?? null,
          geofenceVerified: v.geofence ?? null,
          distanceMeters: v.distanceMeters ?? null,
          correctionReason: curr.correctionReason || null,
        },
        include: { employeeMember: true },
      });
      return wrapAttendance(updated);
    }
  ) as IAttendance;
}

export const AttendanceModel = {
  findById(id: any): SingleQueryBuilder<IAttendance> {
    return new SingleQueryBuilder<IAttendance>(async () => {
      const rawId = toId(id);
      if (!rawId) return null;
      const a = await prisma.attendance.findUnique({
        where: { id: rawId },
        include: { employeeMember: true },
      });
      return wrapAttendance(a);
    });
  },

  findOne(filter: any): SingleQueryBuilder<IAttendance> {
    return new SingleQueryBuilder<IAttendance>(async ({ sort }) => {
      const where: any = {};
      if (filter._id) where.id = toId(filter._id);
      if (filter.id) where.id = toId(filter.id);
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.employeeMemberId) where.employeeMemberId = toId(filter.employeeMemberId);
      if (filter.attendanceDate) where.attendanceDate = filter.attendanceDate;
      if (filter.status) where.status = filter.status;

      let orderBy: any = undefined;
      if (sort) {
        if (sort.attendanceDate) orderBy = { attendanceDate: sort.attendanceDate === -1 ? 'desc' : 'asc' };
        if (sort.createdAt) orderBy = { createdAt: sort.createdAt === -1 ? 'desc' : 'asc' };
      }

      const a = await prisma.attendance.findFirst({
        where,
        orderBy,
        include: { employeeMember: true },
      });
      return wrapAttendance(a);
    });
  },

  find(filter: any = {}): QueryBuilder<IAttendance> {
    return new QueryBuilder<IAttendance>(async ({ sort, limit, populate }) => {
      const where: any = {};
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.employeeMemberId) where.employeeMemberId = toId(filter.employeeMemberId);
      if (filter.status) where.status = filter.status;

      if (filter.attendanceDate) {
        if (typeof filter.attendanceDate === 'string') {
          where.attendanceDate = filter.attendanceDate;
        } else if (filter.attendanceDate.$regex) {
          const pat = String(filter.attendanceDate.$regex).replace(/^\^|\$$/g, '');
          where.attendanceDate = { startsWith: pat };
        } else if (filter.attendanceDate.$gte || filter.attendanceDate.$lte) {
          where.attendanceDate = {};
          if (filter.attendanceDate.$gte) where.attendanceDate.gte = filter.attendanceDate.$gte;
          if (filter.attendanceDate.$lte) where.attendanceDate.lte = filter.attendanceDate.$lte;
        }
      }

      const orderBy: any[] = [];
      if (sort) {
        if (sort.attendanceDate !== undefined) {
          orderBy.push({ attendanceDate: sort.attendanceDate === -1 ? 'desc' : 'asc' });
        }
        if (sort.createdAt !== undefined) {
          orderBy.push({ createdAt: sort.createdAt === -1 ? 'desc' : 'asc' });
        }
      }

      const records = await prisma.attendance.findMany({
        where,
        take: limit,
        orderBy: orderBy.length > 0 ? orderBy : { attendanceDate: 'desc' },
        include: { employeeMember: true },
      });

      return records.map((r) => wrapAttendance(r) as IAttendance);
    });
  },

  async create(data: any): Promise<IAttendance> {
    const v = data.verification || {};
    const created = await prisma.attendance.create({
      data: {
        ...(data._id ? { id: toId(data._id) } : {}),
        workplaceId: toId(data.workplaceId),
        employeeMemberId: toId(data.employeeMemberId),
        userId: data.userId ? toId(data.userId) : null,
        attendanceDate: data.attendanceDate,
        status: data.status || 'PRESENT',
        checkInTime: data.checkInTime || null,
        checkOutTime: data.checkOutTime || null,
        approvedAt: data.approvedAt || null,
        approvedById: data.approvedBy ? toId(data.approvedBy) : null,
        source: data.source || 'QR_REQUEST',
        attendanceRequestId: data.attendanceRequestId ? toId(data.attendanceRequestId) : null,
        qrVerified: v.qr ?? false,
        wifiVerified: v.wifi ?? null,
        geofenceVerified: v.geofence ?? null,
        distanceMeters: v.distanceMeters ?? null,
        correctionReason: data.correctionReason || null,
      },
      include: { employeeMember: true },
    });
    return wrapAttendance(created)!;
  },

  async findOneAndUpdate(filter: any, update: any, options: { upsert?: boolean; new?: boolean } = {}): Promise<any> {
    const wpId = toId(filter.workplaceId);
    const empId = toId(filter.employeeMemberId);
    const date = filter.attendanceDate;

    let existing = await prisma.attendance.findFirst({
      where: {
        workplaceId: wpId,
        employeeMemberId: empId,
        attendanceDate: date,
      },
      include: { employeeMember: true },
    });

    if (!existing && options.upsert) {
      const setOnInsert = update.$setOnInsert || {};
      const setVals = update.$set || {};
      const v = setVals.verification || setOnInsert.verification || {};

      const created = await prisma.attendance.create({
        data: {
          workplaceId: wpId,
          employeeMemberId: empId,
          userId: setOnInsert.userId ? toId(setOnInsert.userId) : null,
          attendanceDate: date,
          status: setVals.status || 'PRESENT',
          checkInTime: setOnInsert.checkInTime || new Date(),
          source: setVals.source || 'MANUAL',
          approvedById: setVals.approvedBy ? toId(setVals.approvedBy) : null,
          approvedAt: setVals.approvedAt || new Date(),
          correctionReason: setVals.correctionReason || null,
          qrVerified: v.qr ?? false,
          wifiVerified: v.wifi ?? null,
        },
        include: { employeeMember: true },
      });
      return wrapAttendance(created);
    }

    if (!existing) return null;

    const setVals = update.$set || {};
    const v = setVals.verification || {};

    const updated = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        status: setVals.status !== undefined ? setVals.status : existing.status,
        source: setVals.source !== undefined ? setVals.source : existing.source,
        approvedById: setVals.approvedBy ? toId(setVals.approvedBy) : existing.approvedById,
        approvedAt: setVals.approvedAt || existing.approvedAt,
        correctionReason: setVals.correctionReason !== undefined ? setVals.correctionReason : existing.correctionReason,
        checkInTime: setVals.checkInTime !== undefined ? setVals.checkInTime : existing.checkInTime,
        checkOutTime: setVals.checkOutTime !== undefined ? setVals.checkOutTime : existing.checkOutTime,
        qrVerified: v.qr !== undefined ? v.qr : existing.qrVerified,
        wifiVerified: v.wifi !== undefined ? v.wifi : existing.wifiVerified,
      },
      include: { employeeMember: true },
    });

    return wrapAttendance(updated);
  },

  async deleteOne(filter: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    const existing = await prisma.attendance.findFirst({ where });
    if (!existing) return { deletedCount: 0 };
    await prisma.attendance.delete({ where: { id: existing.id } });
    return { deletedCount: 1 };
  },

  async deleteMany(filter: any = {}) {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    if (filter.employeeMemberId) where.employeeMemberId = toId(filter.employeeMemberId);
    const res = await prisma.attendance.deleteMany({ where });
    return { deletedCount: res.count };
  },
};
