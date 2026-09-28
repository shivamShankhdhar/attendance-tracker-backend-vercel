import { Request, Response, NextFunction } from 'express';
import { attendanceSessionService } from './attendance-session.service';
import { AppError } from '../../middleware/errorHandler';
import { getParam } from '../../utils/params';

export class AttendanceSessionController {
  async openSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await attendanceSessionService.openTodaySession(
        getParam(req, 'workplaceId'),
        req.user.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getTodaySession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const session = await attendanceSessionService.getTodaySession(getParam(req, 'workplaceId'));
      res.status(200).json({ success: true, data: session });
    } catch (error) {
      next(error);
    }
  }

  async closeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await attendanceSessionService.closeSession(
        getParam(req, 'workplaceId'),
        req.user.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const attendanceSessionController = new AttendanceSessionController();
