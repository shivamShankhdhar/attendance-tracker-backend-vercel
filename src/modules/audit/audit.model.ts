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
    // Audit logs disabled per user requirement - no-op to prevent database clutter
    if (Array.isArray(data)) {
      return data.map((d) => ({
        id: 'noop',
        _id: 'noop',
        workplaceId: d.workplaceId,
        actorId: d.actorId,
        action: d.action,
        entityId: String(d.entityId),
        createdAt: new Date(),
      }));
    }
    return {
      id: 'noop',
      _id: 'noop',
      workplaceId: data?.workplaceId,
      actorId: data?.actorId,
      action: data?.action,
      entityId: String(data?.entityId),
      createdAt: new Date(),
    };
  },

  find(filter: any = {}): QueryBuilder<IAuditLog> {
    return new QueryBuilder<IAuditLog>(async () => []);
  },

  async deleteMany(filter: any = {}) {
    return { deletedCount: 0 };
  },
};
