import { prisma } from '../../config/database';
import { createDocProxy, toId, createPopulatedRef, QueryBuilder, SingleQueryBuilder } from '../../config/prisma-compat';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type AttendanceRequestType = 'CHECK_IN' | 'CHECK_OUT';

export interface IAttendanceRequest {
  _id: any;
  id: string;
  workplaceId: any;
  attendanceSessionId: any;
  employeeMemberId: any;
  userId: any;
  attendanceDate: string; // 'YYYY-MM-DD'
  requestedAt: Date;
  requestType: AttendanceRequestType;
  verification: {
    qrVerified: boolean;
    wifiVerified: boolean | null;
    geofenceVerified?: boolean | null;
    distanceMeters?: number;
    deviceSsid?: string;
  };
  status: RequestStatus;
  reviewedBy?: any;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<IAttendanceRequest>;
}

function wrapAttendanceRequest(r: any): IAttendanceRequest | null {
  if (!r) return null;
  const verification = {
    qrVerified: r.qrVerified ?? false,
    wifiVerified: r.wifiVerified ?? null,
    geofenceVerified: r.geofenceVerified ?? null,
    distanceMeters: r.distanceMeters ?? undefined,
    deviceSsid: r.deviceSsid ?? undefined,
  };

  return createDocProxy<any>(
    {
      ...r,
      workplaceId: createPopulatedRef(r.workplaceId, r.workplace),
      attendanceSessionId: createPopulatedRef(r.attendanceSessionId, r.attendanceSession),
      employeeMemberId: createPopulatedRef(r.employeeMemberId, r.employeeMember),
      userId: createPopulatedRef(r.userId, r.user),
      reviewedBy: r.reviewedById || r.reviewedBy ? createPopulatedRef(r.reviewedById, r.reviewedBy) : undefined,
      rejectionReason: r.rejectionReason ?? undefined,
      reviewedAt: r.reviewedAt ?? undefined,
      verification,
    },
    async (curr) => {
      const v = curr.verification || {};
      const updated = await prisma.attendanceRequest.update({
        where: { id: curr.id },
        data: {
          status: curr.status,
          reviewedById: curr.reviewedBy ? toId(curr.reviewedBy) : null,
          reviewedAt: curr.reviewedAt || null,
          rejectionReason: curr.rejectionReason || null,
          qrVerified: v.qrVerified ?? false,
          wifiVerified: v.wifiVerified ?? null,
          geofenceVerified: v.geofenceVerified ?? null,
          distanceMeters: v.distanceMeters ?? null,
          deviceSsid: v.deviceSsid || null,
        },
        include: { employeeMember: true, user: true },
      });
      return wrapAttendanceRequest(updated);
    }
  ) as IAttendanceRequest;
}

export const AttendanceRequestModel = {
  findById(id: any): SingleQueryBuilder<IAttendanceRequest> {
    return new SingleQueryBuilder<IAttendanceRequest>(async () => {
      const rawId = toId(id);
      if (!rawId) return null;
      const req = await prisma.attendanceRequest.findUnique({
        where: { id: rawId },
        include: { employeeMember: true, user: true },
      });
      return wrapAttendanceRequest(req);
    });
  },

  findOne(filter: any): SingleQueryBuilder<IAttendanceRequest> {
    return new SingleQueryBuilder<IAttendanceRequest>(async ({ sort }) => {
      const where: any = {};
      if (filter._id) where.id = toId(filter._id);
      if (filter.id) where.id = toId(filter.id);
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.employeeMemberId) where.employeeMemberId = toId(filter.employeeMemberId);
      if (filter.attendanceDate) where.attendanceDate = filter.attendanceDate;
      if (filter.requestType) where.requestType = filter.requestType;
      if (filter.status) where.status = filter.status;

      let orderBy: any = undefined;
      if (sort) {
        if (sort.requestedAt) orderBy = { requestedAt: sort.requestedAt === -1 ? 'desc' : 'asc' };
        if (sort.createdAt) orderBy = { createdAt: sort.createdAt === -1 ? 'desc' : 'asc' };
      }

      const req = await prisma.attendanceRequest.findFirst({
        where,
        orderBy,
        include: { employeeMember: true, user: true },
      });
      return wrapAttendanceRequest(req);
    });
  },

  find(filter: any = {}): QueryBuilder<IAttendanceRequest> {
    return new QueryBuilder<IAttendanceRequest>(async ({ sort, limit, populate }) => {
      const where: any = {};
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.attendanceDate) where.attendanceDate = filter.attendanceDate;
      if (filter.status) where.status = filter.status;
      if (filter.employeeMemberId) where.employeeMemberId = toId(filter.employeeMemberId);

      const orderBy: any[] = [];
      if (sort) {
        if (sort.requestedAt !== undefined) {
          orderBy.push({ requestedAt: sort.requestedAt === -1 ? 'desc' : 'asc' });
        }
        if (sort.createdAt !== undefined) {
          orderBy.push({ createdAt: sort.createdAt === -1 ? 'desc' : 'asc' });
        }
      }

      const reqs = await prisma.attendanceRequest.findMany({
        where,
        take: limit,
        orderBy: orderBy.length > 0 ? orderBy : { requestedAt: 'desc' },
        include: { employeeMember: true, user: true },
      });

      return reqs.map((r) => wrapAttendanceRequest(r) as IAttendanceRequest);
    });
  },

  async create(data: any): Promise<IAttendanceRequest> {
    const v = data.verification || {};
    const created = await prisma.attendanceRequest.create({
      data: {
        ...(data._id ? { id: toId(data._id) } : {}),
        workplaceId: toId(data.workplaceId),
        attendanceSessionId: toId(data.attendanceSessionId),
        employeeMemberId: toId(data.employeeMemberId),
        userId: toId(data.userId),
        attendanceDate: data.attendanceDate,
        requestedAt: data.requestedAt || new Date(),
        requestType: data.requestType || 'CHECK_IN',
        qrVerified: v.qrVerified ?? false,
        wifiVerified: v.wifiVerified ?? null,
        geofenceVerified: v.geofenceVerified ?? null,
        distanceMeters: v.distanceMeters ?? null,
        deviceSsid: v.deviceSsid || null,
        status: data.status || 'PENDING',
        reviewedById: data.reviewedBy ? toId(data.reviewedBy) : null,
        reviewedAt: data.reviewedAt || null,
        rejectionReason: data.rejectionReason || null,
      },
      include: { employeeMember: true, user: true },
    });
    return wrapAttendanceRequest(created)!;
  },

  async deleteOne(filter: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    const existing = await prisma.attendanceRequest.findFirst({ where });
    if (!existing) return { deletedCount: 0 };
    await prisma.attendanceRequest.delete({ where: { id: existing.id } });
    return { deletedCount: 1 };
  },

  async deleteMany(filter: any = {}) {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    if (filter.employeeMemberId) where.employeeMemberId = toId(filter.employeeMemberId);
    const res = await prisma.attendanceRequest.deleteMany({ where });
    return { deletedCount: res.count };
  },
};
