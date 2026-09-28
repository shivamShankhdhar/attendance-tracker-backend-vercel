import { Router } from 'express';
import { employeeController } from './employee.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { requireWorkplaceMember, requireWorkplaceRole } from '../../middleware/authorize';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  resetPinSchema,
  claimInvitationSchema,
} from './employee.schema';

export const employeeRouter = Router({ mergeParams: true });

employeeRouter.use(authenticate);

// Publicly available to authenticated users to claim an invite
employeeRouter.post(
  '/invitations/claim',
  validateRequest({ body: claimInvitationSchema }),
  employeeController.claimInvitation
);

// Workplace employee management routes (mergeParams brings in :workplaceId)
employeeRouter.get(
  '/:workplaceId/employees',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  employeeController.getEmployees
);

employeeRouter.post(
  '/:workplaceId/employees',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: createEmployeeSchema }),
  employeeController.addEmployee
);

employeeRouter.patch(
  '/:workplaceId/employees/:memberId',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: updateEmployeeSchema }),
  employeeController.updateEmployee
);

employeeRouter.post(
  '/:workplaceId/employees/:memberId/reset-pin',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: resetPinSchema }),
  employeeController.resetPin
);
