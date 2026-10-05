import { Request, Response, NextFunction } from 'express';
import { employeeService } from './employee.service';
import { AppError } from '../../middleware/errorHandler';
import { getParam } from '../../utils/params';

export class EmployeeController {
  async getEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employees = await employeeService.getEmployees(getParam(req, 'workplaceId'));
      res.status(200).json({ success: true, data: employees });
    } catch (error) {
      next(error);
    }
  }

  async addEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await employeeService.addEmployee(
        getParam(req, 'workplaceId'),
        req.user.userId,
        req.body
      );
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async updateEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const updated = await employeeService.updateEmployee(
        getParam(req, 'workplaceId'),
        getParam(req, 'memberId'),
        req.user.userId,
        req.body
      );
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async resetPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await employeeService.resetPin(
        getParam(req, 'workplaceId'),
        getParam(req, 'memberId'),
        req.user.userId,
        req.body.newPin
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async claimInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await employeeService.claimInvitation(req.user.userId, req.body);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async deleteEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const result = await employeeService.deleteEmployee(
        getParam(req, 'workplaceId'),
        getParam(req, 'memberId'),
        req.user.userId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const employeeController = new EmployeeController();
