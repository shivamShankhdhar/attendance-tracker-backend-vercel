import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { WorkplaceMemberModel, IWorkplaceMember } from '../modules/employee/workplace-member.model';
import { WorkplaceModel, IWorkplace } from '../modules/workplace/workplace.model';
import mongoose from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      workplaceMember?: IWorkplaceMember;
      workplace?: IWorkplace;
    }
  }
}

/**
 * Validates that the authenticated user is an ACTIVE member of the target workplace
 */
export function requireWorkplaceMember() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      // Extract workplaceId from params, query, or body
      const workplaceId = req.params.workplaceId || req.query.workplaceId || req.body.workplaceId;
      if (!workplaceId || !mongoose.Types.ObjectId.isValid(workplaceId as string)) {
        throw new AppError('Valid workplace ID is required', 400, 'INVALID_WORKPLACE_ID');
      }

      const workplace = await WorkplaceModel.findById(workplaceId);
      if (!workplace || workplace.status !== 'ACTIVE') {
        throw new AppError('Workplace not found or inactive', 404, 'WORKPLACE_NOT_FOUND');
      }

      const member = await WorkplaceMemberModel.findOne({
        workplaceId: workplace._id,
        userId: req.user.userId,
        status: 'ACTIVE',
      });

      if (!member) {
        throw new AppError('You are not an active member of this workplace', 403, 'FORBIDDEN');
      }

      req.workplace = workplace;
      req.workplaceMember = member;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Requires a specific role ('EMPLOYER' or 'EMPLOYEE') within the workplace
 */
export function requireWorkplaceRole(allowedRoles: ('EMPLOYER' | 'EMPLOYEE')[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.workplaceMember) {
      return next(new AppError('Workplace membership context missing', 500, 'INTERNAL_ERROR'));
    }

    if (!allowedRoles.includes(req.workplaceMember.role)) {
      return next(
        new AppError(
          `Action requires ${allowedRoles.join(' or ')} permission for this workplace`,
          403,
          'INSUFFICIENT_PERMISSIONS'
        )
      );
    }

    next();
  };
}
