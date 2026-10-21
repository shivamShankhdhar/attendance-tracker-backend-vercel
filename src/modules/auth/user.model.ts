import { prisma } from '../../config/database';
import { createDocProxy, toId, ensureUuid, QueryBuilder, SingleQueryBuilder, ObjectIdCompat } from '../../config/prisma-compat';

export interface IUser {
  _id: any;
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  googleSub?: string;
  status: 'ACTIVE' | 'INACTIVE';
  tokenVersion: number;
  expoPushToken?: string;
  mpinHash?: string;
  mpinFailedAttempts?: number;
  mpinLockedUntil?: Date | null;
  mpinAttemptVersion?: number;
  hasMpin?: boolean;
  appLockEnabled?: boolean;
  biometricEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<IUser>;
}

function wrapUser(u: any): IUser | null {
  if (!u) return null;
  return createDocProxy<any>(
    {
      ...u,
      _id: u.id,
      email: u.email ?? undefined,
      phone: u.phone ?? undefined,
      avatarUrl: u.avatarUrl ?? undefined,
      googleSub: u.googleSub ?? undefined,
      expoPushToken: u.expoPushToken ?? undefined,
      mpinHash: u.mpinHash ?? undefined,
    },
    async (curr) => {
      const updated = await prisma.user.update({
        where: { id: curr.id },
        data: {
          name: curr.name,
          email: curr.email !== undefined ? curr.email : undefined,
          phone: curr.phone !== undefined ? curr.phone : undefined,
          avatarUrl: curr.avatarUrl !== undefined ? curr.avatarUrl : undefined,
          googleSub: curr.googleSub !== undefined ? curr.googleSub : undefined,
          status: curr.status,
          tokenVersion: curr.tokenVersion,
          expoPushToken: curr.expoPushToken !== undefined ? curr.expoPushToken : undefined,
          mpinHash: curr.mpinHash !== undefined ? curr.mpinHash : undefined,
          mpinFailedAttempts: curr.mpinFailedAttempts,
          mpinLockedUntil: curr.mpinLockedUntil,
          mpinAttemptVersion: curr.mpinAttemptVersion,
          hasMpin: curr.hasMpin,
          appLockEnabled: curr.appLockEnabled,
          biometricEnabled: curr.biometricEnabled,
        },
      });
      return { ...updated, _id: updated.id };
    }
  ) as IUser;
}

export const UserModel = {
  findById(id: any): SingleQueryBuilder<IUser> {
    return new SingleQueryBuilder<IUser>(async () => {
      const rawId = toId(id);
      if (!rawId) return null;
      const user = await prisma.user.findUnique({ where: { id: rawId } });
      return wrapUser(user);
    });
  },

  findOne(filter: any): SingleQueryBuilder<IUser> {
    return new SingleQueryBuilder<IUser>(async () => {
      const where: any = {};
      if (filter._id) where.id = toId(filter._id);
      if (filter.id) where.id = toId(filter.id);
      if (filter.googleSub) where.googleSub = filter.googleSub;
      if (filter.email) where.email = filter.email.toLowerCase();
      if (filter.phone) where.phone = filter.phone;

      const user = await prisma.user.findFirst({ where });
      return wrapUser(user);
    });
  },

  async findByIdAndUpdate(id: any, update: any, options: { new?: boolean } = {}): Promise<IUser | null> {
    const rawId = toId(id);
    if (!rawId) return null;
    return this.findOneAndUpdate({ id: rawId }, update, options);
  },

  find(filter: any = {}): QueryBuilder<IUser> {
    return new QueryBuilder<IUser>(async ({ sort, limit }) => {
      const where: any = {};
      if (filter.status) where.status = filter.status;
      const users = await prisma.user.findMany({
        where,
        take: limit,
      });
      return users.map((u) => wrapUser(u) as IUser);
    });
  },

  async create(data: any): Promise<IUser> {
    const created = await prisma.user.create({
      data: {
        id: ensureUuid(data.id || data._id),
        name: data.name,
        email: data.email ? data.email.toLowerCase() : null,
        phone: data.phone || null,
        avatarUrl: data.avatarUrl || null,
        googleSub: data.googleSub || null,
        status: data.status || 'ACTIVE',
        tokenVersion: data.tokenVersion ?? 1,
        expoPushToken: data.expoPushToken || null,
        mpinHash: data.mpinHash || null,
        mpinFailedAttempts: data.mpinFailedAttempts ?? 0,
        mpinLockedUntil: data.mpinLockedUntil || null,
        mpinAttemptVersion: data.mpinAttemptVersion ?? 0,
        hasMpin: data.hasMpin ?? false,
        appLockEnabled: data.appLockEnabled ?? false,
        biometricEnabled: data.biometricEnabled ?? false,
      },
    });
    return wrapUser(created)!;
  },

  async findOneAndUpdate(filter: any, update: any, options: { new?: boolean } = {}): Promise<IUser | null> {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    if (filter.mpinHash) where.mpinHash = filter.mpinHash;

    // Check lock conditions if present
    const existing = await prisma.user.findFirst({ where });
    if (!existing) return null;

    if (filter.$or) {
      // e.g. [{ mpinLockedUntil: null }, { mpinLockedUntil: { $lte: new Date() } }]
      const now = new Date();
      if (existing.mpinLockedUntil && existing.mpinLockedUntil > now) {
        return null;
      }
    }

    const data: any = {};
    if (update.$set) {
      if (update.$set.mpinHash !== undefined) data.mpinHash = update.$set.mpinHash;
      if (update.$set.hasMpin !== undefined) data.hasMpin = update.$set.hasMpin;
      if (update.$set.appLockEnabled !== undefined) data.appLockEnabled = update.$set.appLockEnabled;
      if (update.$set.biometricEnabled !== undefined) data.biometricEnabled = update.$set.biometricEnabled;
      if (update.$set.mpinFailedAttempts !== undefined) data.mpinFailedAttempts = update.$set.mpinFailedAttempts;
      if (update.$set.mpinLockedUntil !== undefined) data.mpinLockedUntil = update.$set.mpinLockedUntil;
      if (update.$set.expoPushToken !== undefined) data.expoPushToken = update.$set.expoPushToken;
      if (update.$set.email !== undefined) data.email = update.$set.email;
      if (update.$set.name !== undefined) data.name = update.$set.name;
    }
    if (update.$inc) {
      if (update.$inc.mpinAttemptVersion) {
        data.mpinAttemptVersion = { increment: update.$inc.mpinAttemptVersion };
      }
    }
    if (update.$unset) {
      if (update.$unset.expoPushToken) data.expoPushToken = null;
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data,
    });
    return wrapUser(updated);
  },

  async updateOne(filter: any, update: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    const existing = await prisma.user.findFirst({ where });
    if (!existing) return { modifiedCount: 0 };

    const data: any = {};
    if (update.$unset) {
      if (update.$unset.expoPushToken) data.expoPushToken = null;
    }
    if (update.$set) {
      Object.assign(data, update.$set);
    }
    await prisma.user.update({ where: { id: existing.id }, data });
    return { modifiedCount: 1 };
  },

  async deleteOne(filter: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    const existing = await prisma.user.findFirst({ where });
    if (!existing) return { deletedCount: 0 };
    await prisma.user.delete({ where: { id: existing.id } });
    return { deletedCount: 1 };
  },

  async deleteMany(filter: any = {}) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    const res = await prisma.user.deleteMany({ where });
    return { deletedCount: res.count };
  },
};
