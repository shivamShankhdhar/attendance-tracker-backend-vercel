import { prisma } from '../../config/database';
import { Request, Response, NextFunction } from 'express';
import { attendanceService } from './attendance.service';
import { AppError } from '../../middleware/errorHandler';
import { getParam } from '../../utils/params';

export class AttendanceController {
  constructor(private readonly db: typeof prisma = prisma) {
    // Express invokes route callbacks without their controller receiver.
    this.getPage = this.getPage.bind(this);
  }
  async getPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workplaceId = getParam(req, 'workplaceId');
      const own = req.workplaceMember?.role === 'EMPLOYEE';
      if (own && req.workplace?.attendanceSettings?.allowEmployeeViewHistory === false) throw new AppError('Attendance history is disabled by your employer', 403, 'HISTORY_DISABLED');
      const memberId = own ? req.workplaceMember!._id.toString() : req.query.memberId as string | undefined;
      const { startDate, endDate, cursor } = req.query as Record<string, string>;
      if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
        throw new AppError('Choose a valid date range', 400, 'INVALID_DATE_RANGE');
      }
      const where: any = { workplaceId, ...(memberId ? { employeeMemberId: memberId } : {}), attendanceDate: { gte: startDate, lte: endDate } };
      if (cursor) {
        const split = cursor.indexOf('|');
        if (split !== 10 || cursor.length > 100) throw new AppError('Invalid page cursor', 400, 'INVALID_CURSOR');
        const date = cursor.slice(0, split), id = cursor.slice(split + 1);
        where.OR = [{ attendanceDate: { lt: date } }, { attendanceDate: date, id: { lt: id } }];
      }
      const rows = await this.db.attendance.findMany({ where, orderBy: [{ attendanceDate: 'desc' }, { id: 'desc' }], take: 21,
        include: { employeeMember: { select: { id: true, name: true, employeeCode: true } } } });
      const page = rows.slice(0, 20), last = page[page.length - 1];
      res.json({ success: true, data: { records: page.map(r => ({ ...r, employee: { memberId: r.employeeMember.id, name: r.employeeMember.name, code: r.employeeMember.employeeCode } })),
        nextCursor: rows.length > 20 && last ? `${last.attendanceDate}|${last.id}` : null } });
    } catch (error) { next(error); }
  }

  async getTodayRoster(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roster = await attendanceService.getTodayRoster(getParam(req, 'workplaceId'), req.query.date as string | undefined);
      if (req.workplaceMember?.role === 'EMPLOYEE') {
        roster.roster = roster.roster.filter(row => row.memberId === req.workplaceMember!._id.toString());
        roster.counts = { totalEmployees: roster.roster.length, presentCount: roster.roster.filter(r => r.status === 'PRESENT').length,
          pendingCount: roster.roster.filter(r => r.status === 'PENDING').length, notMarkedCount: roster.roster.filter(r => r.status === 'NOT_MARKED').length };
      }
      res.status(200).json({ success: true, data: roster });
    } catch (error) {
      next(error);
    }
  }

  async getMyHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const history = await attendanceService.getMyHistory(
        getParam(req, 'workplaceId'),
        req.user.userId,
        req.query
      );
      res.status(200).json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }

  async getReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reports = await attendanceService.getReports(getParam(req, 'workplaceId'), req.query);
      res.status(200).json({ success: true, data: reports });
    } catch (error) {
      next(error);
    }
  }

  async markManualAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await attendanceService.markManualAttendance(
        getParam(req, 'workplaceId'),
        req.user.userId,
        req.body
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getEmployeeHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const history = await attendanceService.getEmployeeHistory(
        getParam(req, 'workplaceId'),
        getParam(req, 'memberId'),
        req.query
      );
      res.status(200).json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }
}

export const attendanceController = new AttendanceController();
