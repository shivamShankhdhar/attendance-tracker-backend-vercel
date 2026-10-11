import { prisma } from '../../config/database';
import { createDocProxy, toId, QueryBuilder } from '../../config/prisma-compat';

export type AuditAction =
  | 'ATTENDANCE_APPROVED'
  | 'ATTENDANCE_REJECTED'
  | 'ATTENDANCE_MODIFIED'
  | 'EMPLOYEE_CREATED'
  | 'EMPLOYEE_DISABLED'
  | 'EMPLOYEE_ACTIVATED'
  | 'ATTENDANCE_SESSION_OPENED'
  | 'ATTENDANCE_SESSION_CLOSED'
  | 'ATTENDANCE_SESSION_REOPENED'
  | 'INVITATION_CREATED'
  | 'INVITATION_CLAIMED'
  | 'JOIN_REQUEST_SUBMITTED'
  | 'JOIN_REQUEST_APPROVED'
  | 'JOIN_REQUEST_REJECTED';

export interface IAuditLog {
  _id: any;
  id: string;
  workplaceId: any;
  actorId: any;
  action: AuditAction | string;
  entityId: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

function wrapAudit(a: any): IAuditLog | null {
  if (!a) return null;
  return createDocProxy<any>(
    {
      ...a,
      _id: a.id,
      metadata: a.metadata || undefined,
    },
    async () => a
  ) as IAuditLog;
}

export const AuditLogModel = {
  async create(data: any, options?: any): Promise<any> {
    if (Array.isArray(data)) {
      const results: IAuditLog[] = [];
      for (const item of data) {
        results.push(await this.create(item));
      }
      return results;
    }

    const created = await prisma.auditLog.create({
      data: {
        workplaceId: toId(data.workplaceId),
        actorId: toId(data.actorId),
        action: data.action,
        entityId: String(data.entityId),
        metadata: data.metadata || null,
      },
    });
    return wrapAudit(created)!;
  },

  find(filter: any = {}): QueryBuilder<IAuditLog> {
    return new QueryBuilder<IAuditLog>(async ({ sort, limit }) => {
      const where: any = {};
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.actorId) where.actorId = toId(filter.actorId);
      if (filter.action) where.action = filter.action;

      const orderBy: any[] = [];
      if (sort) {
        if (sort.createdAt !== undefined) orderBy.push({ createdAt: sort.createdAt === -1 ? 'desc' : 'asc' });
      }

      const logs = await prisma.auditLog.findMany({
        where,
        take: limit,
        orderBy: orderBy.length > 0 ? orderBy : { createdAt: 'desc' },
      });
      return logs.map((l) => wrapAudit(l) as IAuditLog);
    });
  },

  async deleteMany(filter: any = {}) {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    const res = await prisma.auditLog.deleteMany({ where });
    return { deletedCount: res.count };
  },
};
