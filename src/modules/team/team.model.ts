import { prisma } from '../../config/database';
import { createDocProxy, toId, QueryBuilder, SingleQueryBuilder } from '../../config/prisma-compat';

export interface ITeam {
  _id: any;
  id: string;
  workplaceId: any;
  name: string;
  teamCode?: string;
  description?: string;
  color?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<ITeam>;
}

function wrapTeam(t: any): ITeam | null {
  if (!t) return null;
  return createDocProxy<any>(
    {
      ...t,
      _id: t.id,
      teamCode: t.teamCode ?? undefined,
      description: t.description ?? undefined,
      color: t.color || '#5B692D',
      isDefault: t.isDefault ?? false,
    },
    async (curr) => {
      const updated = await prisma.team.update({
        where: { id: curr.id },
        data: {
          name: curr.name,
          teamCode: curr.teamCode !== undefined ? curr.teamCode : undefined,
          description: curr.description !== undefined ? curr.description : undefined,
          color: curr.color || '#5B692D',
          isDefault: curr.isDefault,
        },
      });
      return { ...updated, _id: updated.id };
    }
  ) as ITeam;
}

export const TeamModel = {
  findById(id: any): SingleQueryBuilder<ITeam> {
    return new SingleQueryBuilder<ITeam>(async () => {
      const rawId = toId(id);
      if (!rawId) return null;
      const team = await prisma.team.findUnique({ where: { id: rawId } });
      return wrapTeam(team);
    });
  },

  findOne(filter: any): SingleQueryBuilder<ITeam> {
    return new SingleQueryBuilder<ITeam>(async () => {
      const where: any = {};
      if (filter._id) {
        if (filter._id.$ne) where.id = { not: toId(filter._id.$ne) };
        else where.id = toId(filter._id);
      }
      if (filter.id) where.id = toId(filter.id);
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.isDefault !== undefined) where.isDefault = filter.isDefault;
      if (filter.teamCode) where.teamCode = filter.teamCode;

      if (filter.name) {
        if (typeof filter.name === 'string') {
          where.name = { equals: filter.name, mode: 'insensitive' };
        } else if (filter.name.$regex) {
          const pat = filter.name.$regex instanceof RegExp ? filter.name.$regex.source : String(filter.name.$regex);
          const cleanPat = pat.replace(/^\^|\$$/g, '');
          where.name = { equals: cleanPat, mode: 'insensitive' };
        }
      }

      if (filter.$or) {
        where.OR = filter.$or.map((o: any) => {
          const item: any = {};
          if (o._id) item.id = toId(o._id);
          if (o.teamCode) item.teamCode = o.teamCode;
          return item;
        });
      }

      const team = await prisma.team.findFirst({ where });
      return wrapTeam(team);
    });
  },

  find(filter: any = {}): QueryBuilder<ITeam> {
    return new QueryBuilder<ITeam>(async ({ sort, limit }) => {
      const where: any = {};
      if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
      if (filter.isDefault !== undefined) where.isDefault = filter.isDefault;

      const orderBy: any[] = [];
      if (sort) {
        if (sort.isDefault !== undefined) orderBy.push({ isDefault: sort.isDefault === -1 ? 'desc' : 'asc' });
        if (sort.createdAt !== undefined) orderBy.push({ createdAt: sort.createdAt === -1 ? 'desc' : 'asc' });
      }

      const teams = await prisma.team.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : undefined,
        take: limit,
      });
      return teams.map((t) => wrapTeam(t) as ITeam);
    });
  },

  async create(data: any): Promise<ITeam> {
    const created = await prisma.team.create({
      data: {
        ...(data._id ? { id: toId(data._id) } : {}),
        workplaceId: toId(data.workplaceId),
        name: data.name,
        teamCode: data.teamCode || null,
        description: data.description || null,
        color: data.color || '#5B692D',
        isDefault: data.isDefault ?? false,
      },
    });
    return wrapTeam(created)!;
  },

  async countDocuments(filter: any = {}): Promise<number> {
    const where: any = {};
    if (filter.workplaceId) where.workplaceId = toId(filter.workplaceId);
    return prisma.team.count({ where });
  },

  async findByIdAndUpdate(id: any, update: any): Promise<ITeam | null> {
    const rawId = toId(id);
    if (!rawId) return null;
    const existing = await prisma.team.findUnique({ where: { id: rawId } });
    if (!existing) return null;
    return wrapTeam(existing);
  },

  async findByIdAndDelete(id: any): Promise<ITeam | null> {
    const rawId = toId(id);
    if (!rawId) return null;
    try {
      const deleted = await prisma.team.delete({ where: { id: rawId } });
      return wrapTeam(deleted);
    } catch {
      return null;
    }
  },
};
