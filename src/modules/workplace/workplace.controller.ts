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

  // --- JOIN WORKPLACE VIA QR & APPROVAL FLOW ---

  async getJoinQr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workplaceId = getParam(req, 'workplaceId');
      const data = await workplaceService.getJoinQr(workplaceId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async rotateJoinQr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const workplaceId = getParam(req, 'workplaceId');
      const data = await workplaceService.rotateJoinQr(workplaceId, req.user.userId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async previewJoin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { token } = req.body;
      const data = await workplaceService.previewJoin(req.user.userId, token);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async submitJoinRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await workplaceService.submitJoinRequest(req.user.userId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getMyJoinRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await workplaceService.getMyJoinRequests(req.user.userId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async cancelMyJoinRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const requestId = getParam(req, 'requestId');
      const result = await workplaceService.cancelMyJoinRequest(req.user.userId, requestId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getWorkplaceJoinRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workplaceId = getParam(req, 'workplaceId');
      const status = req.query.status as string | undefined;
      const data = await workplaceService.getWorkplaceJoinRequests(workplaceId, status);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async approveJoinRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const workplaceId = getParam(req, 'workplaceId');
      const requestId = getParam(req, 'requestId');
      const result = await workplaceService.approveJoinRequest(workplaceId, req.user.userId, requestId, req.body);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async rejectJoinRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const workplaceId = getParam(req, 'workplaceId');
      const requestId = getParam(req, 'requestId');
      const result = await workplaceService.rejectJoinRequest(workplaceId, req.user.userId, requestId, req.body);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const workplaceController = new WorkplaceController();

