import { Request, Response, NextFunction } from 'express';
import { attendanceService } from './attendance.service';
import { AppError } from '../../middleware/errorHandler';
import { getParam } from '../../utils/params';

export class AttendanceController {
  async getTodayRoster(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roster = await attendanceService.getTodayRoster(getParam(req, 'workplaceId'));
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
}

export const attendanceController = new AttendanceController();
