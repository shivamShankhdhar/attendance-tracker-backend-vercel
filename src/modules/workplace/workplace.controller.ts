import { Request, Response, NextFunction } from 'express';
import { workplaceService } from './workplace.service';
import { AppError } from '../../middleware/errorHandler';
import { getParam } from '../../utils/params';

export class WorkplaceController {
  async createWorkplace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await workplaceService.createWorkplace(req.user.userId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getMyWorkplaces(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const workplaces = await workplaceService.getMyWorkplaces(req.user.userId);
      res.status(200).json({ success: true, data: workplaces });
    } catch (error) {
      next(error);
    }
  }

  async getWorkplace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workplace = await workplaceService.getWorkplace(getParam(req, 'workplaceId'));
      res.status(200).json({ success: true, data: workplace });
    } catch (error) {
      next(error);
    }
  }

  async updateWorkplace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await workplaceService.updateWorkplace(getParam(req, 'workplaceId'), req.body);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async getPendingInvites(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.email) {
        res.status(200).json({ success: true, data: [] });
        return;
      }
      const invites = await workplaceService.getPendingInvitesForEmail(req.user.email);
      res.status(200).json({ success: true, data: invites });
    } catch (error) {
      next(error);
    }
  }

  async deleteWorkplace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await workplaceService.deleteWorkplace(req.user.userId, getParam(req, 'workplaceId'));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async resetMyAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await workplaceService.resetMyAccount(req.user.userId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const workplaceController = new WorkplaceController();

