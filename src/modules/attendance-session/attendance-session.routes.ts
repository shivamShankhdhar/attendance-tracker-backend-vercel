import { Router } from 'express';
import { attendanceSessionController } from './attendance-session.controller';
import { authenticate } from '../../middleware/authenticate';
import { requireWorkplaceMember, requireWorkplaceRole } from '../../middleware/authorize';

export const attendanceSessionRouter = Router({ mergeParams: true });

attendanceSessionRouter.use(authenticate);

// Open session for today (EMPLOYER only)
attendanceSessionRouter.post(
  '/:workplaceId/attendance-sessions/open',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  attendanceSessionController.openSession
);

// Get today's session (EMPLOYER or EMPLOYEE)
attendanceSessionRouter.get(
  '/:workplaceId/attendance-sessions/today',
  requireWorkplaceMember(),
  attendanceSessionController.getTodaySession
);

// Close session (EMPLOYER only)
attendanceSessionRouter.post(
  '/:workplaceId/attendance-sessions/close',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  attendanceSessionController.closeSession
);
