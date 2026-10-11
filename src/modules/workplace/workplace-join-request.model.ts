import { prisma } from '../../config/database';
import { createDocProxy, toId, createPopulatedRef, QueryBuilder, SingleQueryBuilder } from '../../config/prisma-compat';

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface IWorkplaceJoinRequest {
  _id: any;
  id: string;
  workplaceId: any;
  userId: any;
  teamId?: any;
  name: string;
  email?: string;
  employeeCode?: string;
  avatarUrl?: string;
  note?: string;
  status: JoinRequestStatus;
  reviewedBy?: any;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<IWorkplaceJoinRequest>;
}

function wrapJoinRequest(r: any): IWorkplaceJoinRequest | null {
  if (!r) return null;
  return createDocProxy<any>(
    {
      ...r,
      _id: r.id,
      workplaceId: createPopulatedRef(r.workplaceId, r.workplace),
      userId: createPopulatedRef(r.userId, r.user),
      teamId: r.teamId || r.team ? createPopulatedRef(r.teamId, r.team) : undefined,
      email: r.email ?? undefined,
      employeeCode: r.employeeCode ?? undefined,
      avatarUrl: r.avatarUrl ?? undefined,
      note: r.note ?? undefined,
      reviewedBy: r.reviewedById || r.reviewedBy ? createPopulatedRef(r.reviewedById, r.reviewedBy) : undefined,
      reviewedAt: r.reviewedAt ?? undefined,
      rejectionReason: r.rejectionReason ?? undefined,
    },
    async (curr) => {
      const updated = await prisma.workplaceJoinRequest.update({
        where: { id: curr.id },
        data: {
          status: curr.status,
          reviewedById: curr.reviewedBy ? toId(curr.reviewedBy) : null,
          reviewedAt: curr.reviewedAt || null,
          rejectionReason: curr.rejectionReason !== undefined ? curr.rejectionReason : null,
        },
      });
      return wrapJoinRequest(updated);
    }
  ) as IWorkplaceJoinRequest;
}

export const WorkplaceJoinRequestModel = {
  findById(id: any): SingleQueryBuilder<IWorkplaceJoinRequest> {
    return new SingleQueryBuilder<IWorkplaceJoinRequest>(async () => {
      const rawId = toId(id);
      if (!rawId) return null;
      const req = await prisma.workplaceJoinRequest.findUnique({ where: { id: rawId } });
      return wrapJoinRequest(req);
    });
  },

  findOne(filter: any): SingleQueryBuilder<IWorkplaceJoinRequest> {
    return new SingleQueryBuilder<IWorkplaceJoinRequest>(async ({ sort }) => {
      const where: any = {};
      if (filter._id) where.id = toId(filter._id);
      if (filter.id) where.id = toId(filter.id);
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.userId) where.userId = toId(filter.userId);
      if (filter.status) {
        if (typeof filter.status === 'string') where.status = filter.status;
        else if (filter.status.$ne) where.status = { not: filter.status.$ne };
        else if (filter.status.$in) where.status = { in: filter.status.$in };
        else if (filter.status.$nin) where.status = { notIn: filter.status.$nin };
      }
      if (filter.employeeCode) where.employeeCode = filter.employeeCode;

      if (filter.$or) {
        where.OR = filter.$or.map((o: any) => {
          const item: any = {};
          if (o.userId) item.userId = toId(o.userId);
          if (o.employeeCode) item.employeeCode = o.employeeCode;
          if (o.status) {
            if (typeof o.status === 'string') item.status = o.status;
            else if (o.status.$ne) item.status = { not: o.status.$ne };
            else if (o.status.$in) item.status = { in: o.status.$in };
            else if (o.status.$nin) item.status = { notIn: o.status.$nin };
          }
          return item;
        });
      }

      let orderBy: any = { createdAt: 'desc' };
      if (sort) {
        if (sort.createdAt) orderBy = { createdAt: sort.createdAt === -1 ? 'desc' : 'asc' };
        if (sort.updatedAt) orderBy = { updatedAt: sort.updatedAt === -1 ? 'desc' : 'asc' };
      } else if (filter.updatedAt) {
        orderBy = { updatedAt: 'desc' };
      }

      const req = await prisma.workplaceJoinRequest.findFirst({
        where,
        orderBy,
      });
      return wrapJoinRequest(req);
    });
  },

  async updateMany(filter: any, update: any) {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    if (filter.userId) where.userId = toId(filter.userId);
    if (filter.status) {
      if (typeof filter.status === 'string') where.status = filter.status;
      else if (filter.status.$ne) where.status = { not: filter.status.$ne };
      else if (filter.status.$in) where.status = { in: filter.status.$in };
      else if (filter.status.$nin) where.status = { notIn: filter.status.$nin };
    }
    if (filter.employeeCode) where.employeeCode = filter.employeeCode;

    const data: any = {};
    const setVals = update.$set || update;
    if (setVals.status !== undefined) data.status = setVals.status;
    if (setVals.rejectionReason !== undefined) data.rejectionReason = setVals.rejectionReason;
    if (setVals.reviewedBy) data.reviewedById = toId(setVals.reviewedBy);
    if (setVals.reviewedAt) data.reviewedAt = setVals.reviewedAt;

    const res = await prisma.workplaceJoinRequest.updateMany({ where, data });
    return { modifiedCount: res.count };
  },

  find(filter: any = {}): QueryBuilder<IWorkplaceJoinRequest> {
    return new QueryBuilder<IWorkplaceJoinRequest>(async ({ sort, limit }) => {
      const where: any = {};
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.userId) where.userId = toId(filter.userId);
      if (filter.status) {
        if (typeof filter.status === 'string') where.status = filter.status;
        else if (filter.status.$ne) where.status = { not: filter.status.$ne };
        else if (filter.status.$in) where.status = { in: filter.status.$in };
        else if (filter.status.$nin) where.status = { notIn: filter.status.$nin };
      }

      const orderBy: any[] = [];
      if (sort) {
        if (sort.createdAt !== undefined) orderBy.push({ createdAt: sort.createdAt === -1 ? 'desc' : 'asc' });
        if (sort.updatedAt !== undefined) orderBy.push({ updatedAt: sort.updatedAt === -1 ? 'desc' : 'asc' });
      }

      const reqs = await prisma.workplaceJoinRequest.findMany({
        where,
        take: limit,
        orderBy: orderBy.length > 0 ? orderBy : { createdAt: 'desc' },
      });
      return reqs.map((r) => wrapJoinRequest(r) as IWorkplaceJoinRequest);
    });
  },

  async findOneAndUpdate(filter: any, update: any, options: any = {}): Promise<IWorkplaceJoinRequest | null> {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    if (filter.userId) where.userId = toId(filter.userId);
    if (filter.status) {
      if (typeof filter.status === 'string') where.status = filter.status;
      else if (filter.status.$ne) where.status = { not: filter.status.$ne };
      else if (filter.status.$in) where.status = { in: filter.status.$in };
      else if (filter.status.$nin) where.status = { notIn: filter.status.$nin };
    }

    const existing = await prisma.workplaceJoinRequest.findFirst({ where });
    if (!existing && options.upsert) {
      const setOnInsert = update.$setOnInsert || {};
      const setVals = update.$set || {};
      const dataToCreate: any = {
        workplaceId: toId(filter.workplaceId || setOnInsert.workplaceId || setVals.workplaceId),
        userId: toId(filter.userId || setOnInsert.userId || setVals.userId),
        teamId: setOnInsert.teamId ? toId(setOnInsert.teamId) : setVals.teamId ? toId(setVals.teamId) : null,
        name: setOnInsert.name || setVals.name || '',
        email: setOnInsert.email || setVals.email || '',
        employeeCode: setOnInsert.employeeCode || setVals.employeeCode || null,
        avatarUrl: setOnInsert.avatarUrl || setVals.avatarUrl || null,
        note: setOnInsert.note || setVals.note || null,
        status: setOnInsert.status || setVals.status || filter.status || 'PENDING',
        reviewedById: setOnInsert.reviewedBy ? toId(setOnInsert.reviewedBy) : setVals.reviewedBy ? toId(setVals.reviewedBy) : null,
        reviewedAt: setOnInsert.reviewedAt || setVals.reviewedAt || null,
        rejectionReason: setOnInsert.rejectionReason || setVals.rejectionReason || null,
      };
      const created = await prisma.workplaceJoinRequest.create({ data: dataToCreate });
      return wrapJoinRequest(created);
    }
    if (!existing) return null;

    const setVals = update.$set || update;
    const updated = await prisma.workplaceJoinRequest.update({
      where: { id: existing.id },
      data: {
        status: setVals.status !== undefined ? setVals.status : existing.status,
        reviewedById: setVals.reviewedBy ? toId(setVals.reviewedBy) : existing.reviewedById,
        reviewedAt: setVals.reviewedAt || existing.reviewedAt,
        rejectionReason: setVals.rejectionReason !== undefined ? setVals.rejectionReason : existing.rejectionReason,
      },
    });
    return wrapJoinRequest(updated);
  },

  async create(data: any): Promise<IWorkplaceJoinRequest> {
    const created = await prisma.workplaceJoinRequest.create({
      data: {
        ...(data._id ? { id: toId(data._id) } : {}),
        workplaceId: toId(data.workplaceId),
        userId: toId(data.userId),
        teamId: data.teamId ? toId(data.teamId) : null,
        name: data.name,
        email: data.email || '',
        employeeCode: data.employeeCode || null,
        avatarUrl: data.avatarUrl || null,
        note: data.note || null,
        status: data.status || 'PENDING',
        reviewedById: data.reviewedBy ? toId(data.reviewedBy) : null,
        reviewedAt: data.reviewedAt || null,
        rejectionReason: data.rejectionReason || null,
      },
    });
    return wrapJoinRequest(created)!;
  },

  async deleteOne(filter: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    const existing = await prisma.workplaceJoinRequest.findFirst({ where });
    if (!existing) return { deletedCount: 0 };
    await prisma.workplaceJoinRequest.delete({ where: { id: existing.id } });
    return { deletedCount: 1 };
  },

  async deleteMany(filter: any = {}) {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    if (filter.userId) where.userId = toId(filter.userId);
    const res = await prisma.workplaceJoinRequest.deleteMany({ where });
    return { deletedCount: res.count };
  },
};
