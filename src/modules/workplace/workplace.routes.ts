import { Router } from 'express';
import { workplaceController } from './workplace.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { requireWorkplaceMember, requireWorkplaceRole } from '../../middleware/authorize';
import { createWorkplaceSchema, updateWorkplaceSchema } from './workplace.schema';

export const workplaceRouter = Router();

// All workplace routes require authentication
workplaceRouter.use(authenticate);

workplaceRouter.post(
  '/',
  validateRequest({ body: createWorkplaceSchema }),
  workplaceController.createWorkplace
);

workplaceRouter.get('/', workplaceController.getMyWorkplaces);
workplaceRouter.get('/pending-invites', workplaceController.getPendingInvites);
workplaceRouter.post('/reset-my-account', workplaceController.resetMyAccount);

workplaceRouter.get(
  '/:workplaceId',
  requireWorkplaceMember(),
  workplaceController.getWorkplace
);

workplaceRouter.patch(
  '/:workplaceId',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: updateWorkplaceSchema }),
  workplaceController.updateWorkplace
);

workplaceRouter.delete(
  '/:workplaceId',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  workplaceController.deleteWorkplace
);

