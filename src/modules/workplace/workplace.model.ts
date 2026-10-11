import { prisma } from '../../config/database';
import { createDocProxy, toId, createPopulatedRef, QueryBuilder, SingleQueryBuilder } from '../../config/prisma-compat';

export interface IWorkplace {
  _id: any;
  id: string;
  name: string;
  workplaceCode?: string;
  ownerId: any;
  timezone: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  joinInviteToken?: string;
  previousJoinTokens?: string[];
  joinShareUrl?: string;
  wifiSsid?: string;
  attendanceSettings: {
    requireWifi: boolean;
    autoCloseHour: number;
    allowEmployeeViewHistory?: boolean;
    requireGeofence?: boolean;
    latitude?: number;
    longitude?: number;
    geofenceRadius?: number;
  };
  status: 'ACTIVE' | 'INACTIVE';
  joinQrSecret?: string;
  joinQrEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<IWorkplace>;
}

function wrapWorkplace(wp: any): IWorkplace | null {
  if (!wp) return null;
  const attendanceSettings = {
    requireWifi: wp.requireWifi ?? false,
    autoCloseHour: wp.autoCloseHour ?? 23,
    allowEmployeeViewHistory: wp.allowEmployeeViewHistory ?? true,
    requireGeofence: wp.requireGeofence ?? false,
    latitude: wp.geoLatitude ?? wp.latitude ?? undefined,
    longitude: wp.geoLongitude ?? wp.longitude ?? undefined,
    geofenceRadius: wp.geofenceRadius ?? 100,
  };

  return createDocProxy<any>(
    {
      ...wp,
      _id: wp.id,
      ownerId: createPopulatedRef(wp.ownerId, wp.owner),
      workplaceCode: wp.workplaceCode ?? undefined,
      address: wp.address ?? undefined,
      latitude: wp.latitude ?? undefined,
      longitude: wp.longitude ?? undefined,
      description: wp.description ?? undefined,
      joinInviteToken: wp.joinInviteToken ?? undefined,
      previousJoinTokens: wp.previousJoinTokens || [],
      joinShareUrl: wp.joinShareUrl ?? undefined,
      wifiSsid: wp.wifiSsid ?? undefined,
      joinQrSecret: wp.joinQrSecret ?? undefined,
      joinQrEnabled: wp.joinQrEnabled ?? true,
      attendanceSettings,
    },
    async (curr) => {
      const att = curr.attendanceSettings || {};
      const updated = await prisma.workplace.update({
        where: { id: curr.id },
        data: {
          name: curr.name,
          workplaceCode: curr.workplaceCode !== undefined ? curr.workplaceCode : undefined,
          timezone: curr.timezone,
          address: curr.address !== undefined ? curr.address : undefined,
          latitude: curr.latitude !== undefined ? curr.latitude : undefined,
          longitude: curr.longitude !== undefined ? curr.longitude : undefined,
          description: curr.description !== undefined ? curr.description : undefined,
          joinInviteToken: curr.joinInviteToken !== undefined ? curr.joinInviteToken : undefined,
          previousJoinTokens: curr.previousJoinTokens || [],
          joinShareUrl: curr.joinShareUrl !== undefined ? curr.joinShareUrl : undefined,
          wifiSsid: curr.wifiSsid !== undefined ? curr.wifiSsid : undefined,
          requireWifi: att.requireWifi ?? false,
          autoCloseHour: att.autoCloseHour ?? 23,
          allowEmployeeViewHistory: att.allowEmployeeViewHistory ?? true,
          requireGeofence: att.requireGeofence ?? false,
          geoLatitude: att.latitude !== undefined ? att.latitude : undefined,
          geoLongitude: att.longitude !== undefined ? att.longitude : undefined,
          geofenceRadius: att.geofenceRadius ?? 100,
          joinQrSecret: curr.joinQrSecret !== undefined ? curr.joinQrSecret : undefined,
          joinQrEnabled: curr.joinQrEnabled ?? true,
          status: curr.status,
        },
      });
      return { ...updated, _id: updated.id, attendanceSettings: curr.attendanceSettings };
    }
  ) as IWorkplace;
}

export const WorkplaceModel = {
  findById(id: any): SingleQueryBuilder<IWorkplace> {
    return new SingleQueryBuilder<IWorkplace>(async () => {
      const rawId = toId(id);
      if (!rawId) return null;
      const wp = await prisma.workplace.findUnique({
        where: { id: rawId },
        include: { owner: true },
      });
      return wrapWorkplace(wp);
    });
  },

  findOne(filter: any): SingleQueryBuilder<IWorkplace> {
    return new SingleQueryBuilder<IWorkplace>(async () => {
      const where: any = {};
      if (filter._id) where.id = toId(filter._id);
      if (filter.id) where.id = toId(filter.id);
      if (filter.workplaceCode) where.workplaceCode = filter.workplaceCode;
      if (filter.joinInviteToken) where.joinInviteToken = filter.joinInviteToken;
      if (filter.status) where.status = filter.status;

      if (filter.$or) {
        where.OR = filter.$or.map((o: any) => {
          const item: any = {};
          if (o.workplaceCode) item.workplaceCode = o.workplaceCode;
          if (o.code) item.workplaceCode = o.code;
          if (o._id) item.id = toId(o._id);
          return item;
        });
      }

      const wp = await prisma.workplace.findFirst({
        where,
        include: { owner: true },
      });
      return wrapWorkplace(wp);
    });
  },

  async findByIdAndUpdate(id: any, update: any, options: any = {}): Promise<IWorkplace | null> {
    const rawId = toId(id);
    if (!rawId) return null;
    const existing = await prisma.workplace.findUnique({ where: { id: rawId } });
    if (!existing) return null;

    const data: any = {};
    const setVals = update.$set || update;
    if (setVals.name !== undefined) data.name = setVals.name;
    if (setVals.address !== undefined) data.address = setVals.address;
    if (setVals.timezone !== undefined) data.timezone = setVals.timezone;
    if (setVals.wifiSsid !== undefined) data.wifiSsid = setVals.wifiSsid;
    if (setVals.joinInviteToken !== undefined) data.joinInviteToken = setVals.joinInviteToken;
    if (setVals.joinShareUrl !== undefined) data.joinShareUrl = setVals.joinShareUrl;
    if (setVals.status !== undefined) data.status = setVals.status;
    if (setVals.attendanceSettings) {
      const att = setVals.attendanceSettings;
      if (att.requireWifi !== undefined) data.requireWifi = att.requireWifi;
      if (att.autoCloseHour !== undefined) data.autoCloseHour = att.autoCloseHour;
      if (att.allowEmployeeViewHistory !== undefined) data.allowEmployeeViewHistory = att.allowEmployeeViewHistory;
      if (att.requireGeofence !== undefined) data.requireGeofence = att.requireGeofence;
      if (att.latitude !== undefined) data.geoLatitude = att.latitude;
      if (att.longitude !== undefined) data.geoLongitude = att.longitude;
      if (att.geofenceRadius !== undefined) data.geofenceRadius = att.geofenceRadius;
    }
    if (update.$push && update.$push.previousJoinTokens) {
      data.previousJoinTokens = [...(existing.previousJoinTokens || []), update.$push.previousJoinTokens];
    }

    const updated = await prisma.workplace.update({
      where: { id: rawId },
      data,
      include: { owner: true },
    });
    return wrapWorkplace(updated);
  },

  async updateOne(filter: any, update: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    if (filter.joinInviteToken) where.joinInviteToken = filter.joinInviteToken;

    const existing = await prisma.workplace.findFirst({ where });
    if (!existing) return { modifiedCount: 0 };

    const data: any = {};
    const setVals = update.$set || update;
    if (setVals.joinShareUrl !== undefined) data.joinShareUrl = setVals.joinShareUrl;
    if (setVals.joinInviteToken !== undefined) data.joinInviteToken = setVals.joinInviteToken;
    if (setVals.wifiSsid !== undefined) data.wifiSsid = setVals.wifiSsid;
    if (setVals.name !== undefined) data.name = setVals.name;
    if (setVals.attendanceSettings) {
      const att = setVals.attendanceSettings;
      if (att.requireWifi !== undefined) data.requireWifi = att.requireWifi;
      if (att.autoCloseHour !== undefined) data.autoCloseHour = att.autoCloseHour;
      if (att.allowEmployeeViewHistory !== undefined) data.allowEmployeeViewHistory = att.allowEmployeeViewHistory;
      if (att.requireGeofence !== undefined) data.requireGeofence = att.requireGeofence;
      if (att.latitude !== undefined) data.geoLatitude = att.latitude;
      if (att.longitude !== undefined) data.geoLongitude = att.longitude;
      if (att.geofenceRadius !== undefined) data.geofenceRadius = att.geofenceRadius;
    }
    if (update.$push && update.$push.previousJoinTokens) {
      data.previousJoinTokens = [...(existing.previousJoinTokens || []), update.$push.previousJoinTokens];
    }

    await prisma.workplace.update({
      where: { id: existing.id },
      data,
    });
    return { modifiedCount: 1 };
  },

  find(filter: any = {}): QueryBuilder<IWorkplace> {
    return new QueryBuilder<IWorkplace>(async ({ sort, limit }) => {
      const where: any = {};
      if (filter.ownerId) where.ownerId = toId(filter.ownerId);
      if (filter.status) where.status = filter.status;
      if (filter._id) where.id = toId(filter._id);

      const workplaces = await prisma.workplace.findMany({
        where,
        take: limit,
        include: { owner: true },
      });
      return workplaces.map((w) => wrapWorkplace(w) as IWorkplace);
    });
  },

  async create(data: any): Promise<IWorkplace> {
    const att = data.attendanceSettings || {};
    const created = await prisma.workplace.create({
      data: {
        ...(data._id ? { id: toId(data._id) } : {}),
        name: data.name,
        workplaceCode: data.workplaceCode || null,
        ownerId: toId(data.ownerId),
        timezone: data.timezone || 'Asia/Kolkata',
        address: data.address || null,
        latitude: data.latitude ?? att.latitude ?? null,
        longitude: data.longitude ?? att.longitude ?? null,
        description: data.description || null,
        joinInviteToken: data.joinInviteToken || null,
        previousJoinTokens: data.previousJoinTokens || [],
        joinShareUrl: data.joinShareUrl || null,
        wifiSsid: data.wifiSsid || null,
        requireWifi: att.requireWifi ?? false,
        autoCloseHour: att.autoCloseHour ?? 23,
        allowEmployeeViewHistory: att.allowEmployeeViewHistory ?? true,
        requireGeofence: att.requireGeofence ?? false,
        geoLatitude: att.latitude ?? null,
        geoLongitude: att.longitude ?? null,
        geofenceRadius: att.geofenceRadius ?? 100,
        joinQrSecret: data.joinQrSecret || null,
        joinQrEnabled: data.joinQrEnabled ?? true,
        status: data.status || 'ACTIVE',
      },
      include: { owner: true },
    });
    return wrapWorkplace(created)!;
  },

  /**
   * Deletes workplace. Triggers PostgreSQL CASCADE DELETE on all related entities:
   * teams, members, attendance, sessions, requests, notifications, and audits!
   */
  async findByIdAndDelete(id: any): Promise<IWorkplace | null> {
    const rawId = toId(id);
    if (!rawId) return null;
    try {
      const deleted = await prisma.workplace.delete({
        where: { id: rawId },
      });
      return wrapWorkplace(deleted);
    } catch {
      return null;
    }
  },

  async deleteOne(filter: any) {
    const where: any = {};
    if (filter._id) where.id = toId(filter._id);
    if (filter.id) where.id = toId(filter.id);
    const existing = await prisma.workplace.findFirst({ where });
    if (!existing) return { deletedCount: 0 };
    await prisma.workplace.delete({ where: { id: existing.id } });
    return { deletedCount: 1 };
  },

  async deleteMany(filter: any = {}) {
    const where: any = {};
    if (filter.ownerId) where.ownerId = toId(filter.ownerId);
    if (filter._id) where.id = toId(filter._id);
    const res = await prisma.workplace.deleteMany({ where });
    return { deletedCount: res.count };
  },
};
