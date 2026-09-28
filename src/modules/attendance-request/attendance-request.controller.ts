import { Request, Response, NextFunction } from 'express';
import { attendanceRequestService } from './attendance-request.service';
import { AppError } from '../../middleware/errorHandler';
import { getParam } from '../../utils/params';

export class AttendanceRequestController {
  async submitRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await attendanceRequestService.submitRequest(req.user.userId, req.body);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getWorkplaceRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, date } = req.query as { status?: string; date?: string };
      const requests = await attendanceRequestService.getWorkplaceRequests(
        getParam(req, 'workplaceId'),
        status,
        date
      );
      res.status(200).json({ success: true, data: requests });
    } catch (error) {
      next(error);
    }
  }

  async getMyTodayRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const request = await attendanceRequestService.getMyTodayRequest(
        getParam(req, 'workplaceId'),
        req.user.userId
      );
      res.status(200).json({ success: true, data: request });
    } catch (error) {
      next(error);
    }
  }

  async approveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await attendanceRequestService.approveRequest(
        getParam(req, 'workplaceId'),
        getParam(req, 'requestId'),
        req.user.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async rejectRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { reason } = req.body;
      const result = await attendanceRequestService.rejectRequest(
        getParam(req, 'workplaceId'),
        getParam(req, 'requestId'),
        req.user.userId,
        reason
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const attendanceRequestController = new AttendanceRequestController();
