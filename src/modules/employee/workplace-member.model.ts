import { prisma } from '../../config/database';
import { createDocProxy, toId, createPopulatedRef, QueryBuilder, SingleQueryBuilder } from '../../config/prisma-compat';

export interface IWorkplaceMember {
  _id: any;
  id: string;
  workplaceId: any;
  userId?: any;
  teamId?: any;
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
  save(opts?: any): Promise<IWorkplaceMember>;
}

function wrapMember(m: any): IWorkplaceMember | null {
  if (!m) return null;
  return createDocProxy<any>(
    {
      ...m,
      workplaceId: createPopulatedRef(m.workplaceId, m.workplace),
      userId: m.userId || m.user ? createPopulatedRef(m.userId, m.user) : undefined,
      teamId: m.teamId || m.team ? createPopulatedRef(m.teamId, m.team) : undefined,
      employeeCode: m.employeeCode ?? undefined,
      invitedEmail: m.invitedEmail ?? undefined,
      pinHash: m.pinHash ?? undefined,
      invitationCode: m.invitationCode ?? undefined,
      invitationTokenHash: m.invitationTokenHash ?? undefined,
      invitationExpiresAt: m.invitationExpiresAt ?? undefined,
      joinedAt: m.joinedAt ?? undefined,
      lastWifiSeenAt: m.lastWifiSeenAt ?? undefined,
      lastConnectedSsid: m.lastConnectedSsid ?? undefined,
    },
    async (curr) => {
      const updated = await prisma.workplaceMember.update({
        where: { id: curr.id },
        data: {
          name: curr.name,
          employeeCode: curr.employeeCode !== undefined ? curr.employeeCode : undefined,
          invitedEmail: curr.invitedEmail !== undefined ? curr.invitedEmail : undefined,
          pinHash: curr.pinHash !== undefined ? curr.pinHash : undefined,
          role: curr.role,
          status: curr.status,
          userId: curr.userId ? toId(curr.userId) : null,
          teamId: curr.teamId ? toId(curr.teamId) : null,
          invitationCode: curr.invitationCode !== undefined ? curr.invitationCode : null,
          invitationTokenHash: curr.invitationTokenHash !== undefined ? curr.invitationTokenHash : null,
          invitationExpiresAt: curr.invitationExpiresAt || null,
          joinedAt: curr.joinedAt || null,
          lastWifiSeenAt: curr.lastWifiSeenAt || null,
          lastConnectedSsid: curr.lastConnectedSsid || null,
        },
        include: { user: true, team: true, workplace: true },
      });
      return wrapMember(updated);
    }
  ) as IWorkplaceMember;
}

export const WorkplaceMemberModel = {
  findById(id: any): SingleQueryBuilder<IWorkplaceMember> {
    return new SingleQueryBuilder<IWorkplaceMember>(async () => {
      const rawId = toId(id);
      if (!rawId) return null;
      const m = await prisma.workplaceMember.findUnique({
        where: { id: rawId },
        include: { user: true, team: true, workplace: true },
      });
      return wrapMember(m);
    });
  },

  findOne(filter: any): SingleQueryBuilder<IWorkplaceMember> {
    return new SingleQueryBuilder<IWorkplaceMember>(async ({ sort }) => {
      const where: any = {};
      if (filter._id) where.id = toId(filter._id);
      if (filter.id) where.id = toId(filter.id);
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.userId) where.userId = toId(filter.userId);
      if (filter.teamId) where.teamId = toId(filter.teamId);
      if (filter.role) where.role = filter.role;
      if (filter.status) {
        if (typeof filter.status === 'string') where.status = filter.status;
        else if (filter.status.$in) where.status = { in: filter.status.$in };
      }
      if (filter.employeeCode) where.employeeCode = filter.employeeCode;
      if (filter.invitedEmail) {
        if (typeof filter.invitedEmail === 'string') where.invitedEmail = filter.invitedEmail.toLowerCase();
        else if (filter.invitedEmail.$exists) where.invitedEmail = { not: null };
      }
      if (filter.invitationCode) where.invitationCode = filter.invitationCode;
      if (filter.invitationTokenHash) where.invitationTokenHash = filter.invitationTokenHash;

      if (filter.invitationExpiresAt && filter.invitationExpiresAt.$gt) {
        where.invitationExpiresAt = { gt: filter.invitationExpiresAt.$gt };
      }

      if (filter.$or) {
        const mappedOr = filter.$or.map((o: any) => {
          const item: any = {};
          if (o.userId) item.userId = toId(o.userId);
          if (o.invitedEmail) item.invitedEmail = typeof o.invitedEmail === 'string' ? o.invitedEmail.toLowerCase() : undefined;
          if (o.invitationCode) item.invitationCode = o.invitationCode;
          if (o.invitationTokenHash) item.invitationTokenHash = o.invitationTokenHash;
          if (o.employeeCode) item.employeeCode = o.employeeCode;
          return item;
        }).filter((item: any) => Object.keys(item).length > 0);
        if (mappedOr.length > 0) {
          where.OR = mappedOr;
        }
      }

      let orderBy: any = { createdAt: 'desc' };
      if (sort) {
        if (sort.updatedAt) orderBy = { updatedAt: sort.updatedAt === -1 ? 'desc' : 'asc' };
        if (sort.createdAt) orderBy = { createdAt: sort.createdAt === -1 ? 'desc' : 'asc' };
      } else if (filter.updatedAt) {
        orderBy = { updatedAt: 'desc' };
      }

      const m = await prisma.workplaceMember.findFirst({
        where,
        orderBy,
        include: { user: true, team: true, workplace: true },
      });
      return wrapMember(m);
    });
  },

  async aggregate(pipeline: any[]): Promise<any[]> {
    const match = pipeline.find((p) => p.$match)?.$match || {};
    const where: any = {};
    if (match.workplaceId) {
      if (match.workplaceId.$in) {
        where.workplaceId = { in: match.workplaceId.$in.map((id: any) => toId(id)) };
      } else {
        where.workplaceId = toId(match.workplaceId);
      }
    }
    if (match.role) where.role = match.role;
    if (match.status) where.status = match.status;

    const grouped = await prisma.workplaceMember.groupBy({
      by: ['workplaceId'],
      where,
      _count: { id: true },
    });

    return grouped.map((g) => ({
      _id: g.workplaceId,
      count: g._count.id,
    }));
  },

  find(filter: any = {}): QueryBuilder<IWorkplaceMember> {
    return new QueryBuilder<IWorkplaceMember>(async ({ sort, limit, populate }) => {
      const where: any = {};
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.role) where.role = filter.role;
      if (filter.userId) where.userId = toId(filter.userId);
      if (filter.teamId) where.teamId = toId(filter.teamId);
      if (filter.employeeCode) where.employeeCode = filter.employeeCode;
      if (filter.status) {
        if (typeof filter.status === 'string') where.status = filter.status;
        else if (filter.status.$in) where.status = { in: filter.status.$in };
      }

      if (filter.$or) {
        where.OR = filter.$or.map((o: any) => {
          const item: any = {};
          if (o.userId) item.userId = toId(o.userId);
          if (o.invitedEmail) item.invitedEmail = typeof o.invitedEmail === 'string' ? o.invitedEmail.toLowerCase() : undefined;
          return item;
        });
      }

      const orderBy: any[] = [];
      if (sort) {
        if (sort.createdAt !== undefined) orderBy.push({ createdAt: sort.createdAt === -1 ? 'desc' : 'asc' });
        if (sort.name !== undefined) orderBy.push({ name: sort.name === -1 ? 'desc' : 'asc' });
      }

      const members = await prisma.workplaceMember.findMany({
        where,
        take: limit,
        orderBy: orderBy.length > 0 ? orderBy : { createdAt: 'desc' },
        include: {
          user: true,
          team: true,
          workplace: { include: { owner: true } },
        },
      });

      return members.map((m) => wrapMember(m) as IWorkplaceMember);
    });
  },

  async create(data: any, options?: any): Promise<any> {
    if (Array.isArray(data)) {
      const results: IWorkplaceMember[] = [];
      for (const item of data) {
        results.push(await this.create(item));
      }
      return results;
    }

    const created = await prisma.workplaceMember.create({
      data: {
        ...(data._id ? { id: toId(data._id) } : {}),
        workplaceId: toId(data.workplaceId),
        userId: data.userId ? toId(data.userId) : null,
        teamId: data.teamId ? toId(data.teamId) : null,
        role: data.role,
        name: data.name,
        employeeCode: data.employeeCode || null,
        invitedEmail: data.invitedEmail ? data.invitedEmail.toLowerCase() : null,
        pinHash: data.pinHash || null,
        status: data.status || 'INVITED',
        invitationCode: data.invitationCode || null,
        invitationTokenHash: data.invitationTokenHash || null,
        invitationExpiresAt: data.invitationExpiresAt || null,
        joinedAt: data.joinedAt || null,
      },
      include: { user: true, team: true, workplace: true },
    });
    return wrapMember(created)!;
  },

  async updateMany(filter: any, update: any) {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    if (filter.invitedEmail) {
      if (typeof filter.invitedEmail === 'string') {
        where.invitedEmail = filter.invitedEmail.toLowerCase();
      } else if (filter.invitedEmail.$regex) {
        const pattern = filter.invitedEmail.$regex instanceof RegExp
          ? filter.invitedEmail.$regex.source.replace(/^\^|\$$/g, '').toLowerCase()
          : String(filter.invitedEmail.$regex).replace(/^\^|\$$/g, '').toLowerCase();
        where.invitedEmail = { equals: pattern, mode: 'insensitive' };
      }
    }
    if (filter.status) where.status = filter.status;
    if (filter.teamId) where.teamId = toId(filter.teamId);

    const data: any = {};
    if (update.$set) {
      if (update.$set.userId) data.userId = toId(update.$set.userId);
      if (update.$set.status) data.status = update.$set.status;
      if (update.$set.joinedAt) data.joinedAt = update.$set.joinedAt;
      if (update.$set.teamId) data.teamId = toId(update.$set.teamId);
    }

    const res = await prisma.workplaceMember.updateMany({ where, data });
    return { modifiedCount: res.count };
  },

  /**
   * Deleting a member triggers PostgreSQL CASCADE DELETE on all Attendances and AttendanceRequests!
   */
  async deleteOne(filter: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    const existing = await prisma.workplaceMember.findFirst({ where });
    if (!existing) return { deletedCount: 0 };
    await prisma.workplaceMember.delete({ where: { id: existing.id } });
    return { deletedCount: 1 };
  },

  async deleteMany(filter: any = {}) {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    if (filter.userId) where.userId = toId(filter.userId);
    const res = await prisma.workplaceMember.deleteMany({ where });
    return { deletedCount: res.count };
  },

  async countDocuments(filter: any = {}): Promise<number> {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    if (filter.role) where.role = filter.role;
    if (filter.status) {
      if (typeof filter.status === 'string') where.status = filter.status;
      else if (filter.status.$in) where.status = { in: filter.status.$in };
    }
    return prisma.workplaceMember.count({ where });
  },
};
