import { Router } from 'express';
import { workplaceController } from './workplace.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { requireWorkplaceMember, requireWorkplaceRole } from '../../middleware/authorize';
import {
  createWorkplaceSchema,
  updateWorkplaceSchema,
  joinPreviewSchema,
  submitJoinRequestSchema,
  approveJoinRequestSchema,
  rejectJoinRequestSchema,
} from './workplace.schema';

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

// --- Candidate Employee Join Flow (User is authenticated, but not yet a member) ---
workplaceRouter.post(
  '/join-preview',
  validateRequest({ body: joinPreviewSchema }),
  workplaceController.previewJoin
);

workplaceRouter.post(
  '/join-requests',
  validateRequest({ body: submitJoinRequestSchema }),
  workplaceController.submitJoinRequest
);

workplaceRouter.get('/my-join-requests', workplaceController.getMyJoinRequests);
workplaceRouter.post('/my-join-requests/:requestId/cancel', workplaceController.cancelMyJoinRequest);

// --- Employer Workplace Management Endpoints ---
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

// Join QR generation & rotation (EMPLOYER only)
workplaceRouter.get(
  '/:workplaceId/join-qr',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  workplaceController.getJoinQr
);

workplaceRouter.post(
  '/:workplaceId/join-qr/rotate',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  workplaceController.rotateJoinQr
);

// Join requests review & approval (EMPLOYER only)
workplaceRouter.get(
  '/:workplaceId/join-requests',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  workplaceController.getWorkplaceJoinRequests
);

workplaceRouter.post(
  '/:workplaceId/join-requests/:requestId/approve',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: approveJoinRequestSchema }),
  workplaceController.approveJoinRequest
);

workplaceRouter.post(
  '/:workplaceId/join-requests/:requestId/reject',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: rejectJoinRequestSchema }),
  workplaceController.rejectJoinRequest
);

