import { prisma } from '../../config/database';
import { createDocProxy, toId, QueryBuilder } from '../../config/prisma-compat';

export type NotificationKind =
  | 'ATTENDANCE_REQUESTED'
  | 'ATTENDANCE_APPROVED'
  | 'ATTENDANCE_REJECTED'
  | 'INVITATION_RECEIVED'
  | 'JOIN_REQUESTED'
  | 'JOIN_APPROVED'
  | 'JOIN_REJECTED';

export interface INotificationOutbox {
  _id: any;
  id: string;
  eventId: string;
  recipientId: any;
  workplaceId: any;
  kind: NotificationKind;
  title: string;
  body: string;
  data?: Record<string, any>;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  nextAttemptAt: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<INotificationOutbox>;
}

function wrapNotification(n: any): INotificationOutbox | null {
  if (!n) return null;
  return createDocProxy<any>(
    {
      ...n,
      _id: n.id,
      data: n.data || undefined,
      lastError: n.lastError || undefined,
    },
    async (curr) => {
      const updated = await prisma.notificationOutbox.update({
        where: { id: curr.id },
        data: {
          status: curr.status,
          attempts: curr.attempts,
          nextAttemptAt: curr.nextAttemptAt,
          lastError: curr.lastError || null,
        },
      });
      return wrapNotification(updated);
    }
  ) as INotificationOutbox;
}

export const NotificationOutboxModel = {
  async findOneAndUpdate(filter: any, update: any, options: { new?: boolean; sort?: any } = {}): Promise<INotificationOutbox | null> {
    const where: any = {};
    if (filter.status) where.status = filter.status;
    if (filter.nextAttemptAt && filter.nextAttemptAt.$lte) {
      where.nextAttemptAt = { lte: filter.nextAttemptAt.$lte };
    }
    if (filter.attempts && filter.attempts.$lt) {
      where.attempts = { lt: filter.attempts.$lt };
    }
    if (filter.eventId) {
      if (typeof filter.eventId === 'string') where.eventId = filter.eventId;
      else if (filter.eventId.$in) where.eventId = { in: filter.eventId.$in };
    }

    const job = await prisma.notificationOutbox.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return null;

    const data: any = {};
    if (update.$set) {
      if (update.$set.nextAttemptAt) data.nextAttemptAt = update.$set.nextAttemptAt;
    }

    const updated = await prisma.notificationOutbox.update({
      where: { id: job.id },
      data,
    });
    return wrapNotification(updated);
  },

  async create(data: any, options?: any): Promise<any> {
    if (Array.isArray(data)) {
      const results: INotificationOutbox[] = [];
      for (const item of data) {
        results.push(await this.create(item));
      }
      return results;
    }

    const created = await prisma.notificationOutbox.create({
      data: {
        eventId: data.eventId,
        recipientId: toId(data.recipientId),
        workplaceId: toId(data.workplaceId),
        kind: data.kind,
        title: data.title,
        body: data.body,
        data: data.data || null,
        status: data.status || 'PENDING',
        attempts: data.attempts ?? 0,
        nextAttemptAt: data.nextAttemptAt || new Date(),
        lastError: data.lastError || null,
      },
    });
    return wrapNotification(created)!;
  },

  find(filter: any = {}): QueryBuilder<INotificationOutbox> {
    return new QueryBuilder<INotificationOutbox>(async ({ sort, limit }) => {
      const where: any = {};
      if (filter.recipientId) where.recipientId = toId(filter.recipientId);
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.status) where.status = filter.status;

      const orderBy: any[] = [];
      if (sort) {
        if (sort.createdAt !== undefined) orderBy.push({ createdAt: sort.createdAt === -1 ? 'desc' : 'asc' });
      }

      const jobs = await prisma.notificationOutbox.findMany({
        where,
        take: limit,
        orderBy: orderBy.length > 0 ? orderBy : { createdAt: 'desc' },
      });
      return jobs.map((j) => wrapNotification(j) as INotificationOutbox);
    });
  },

  async updateOne(filter: any, update: any, options: { upsert?: boolean } = {}) {
    const where: any = {};
    if (filter.eventId) where.eventId = filter.eventId;

    let existing = await prisma.notificationOutbox.findFirst({ where });
    if (!existing && options.upsert) {
      const setOnInsert = update.$setOnInsert || {};
      const setVals = update.$set || {};
      const data = { ...setOnInsert, ...setVals, eventId: filter.eventId };
      await this.create(data);
      return { modifiedCount: 1, upsertedCount: 1 };
    }

    if (!existing) return { modifiedCount: 0 };

    const setVals = update.$set || {};
    const data: any = {};
    if (setVals.status) data.status = setVals.status;
    if (setVals.attempts !== undefined) data.attempts = setVals.attempts;
    if (setVals.nextAttemptAt) data.nextAttemptAt = setVals.nextAttemptAt;

    await prisma.notificationOutbox.update({
      where: { id: existing.id },
      data,
    });
    return { modifiedCount: 1 };
  },

  async deleteOne(filter: any = {}) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    const existing = await prisma.notificationOutbox.findFirst({ where });
    if (!existing) return { deletedCount: 0 };
    await prisma.notificationOutbox.delete({ where: { id: existing.id } });
    return { deletedCount: 1 };
  },

  async deleteMany(filter: any = {}) {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    const res = await prisma.notificationOutbox.deleteMany({ where });
    return { deletedCount: res.count };
  },
};

