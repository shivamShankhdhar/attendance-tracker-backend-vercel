import { Router } from 'express';
import { attendanceRequestController } from './attendance-request.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { requireWorkplaceMember, requireWorkplaceRole } from '../../middleware/authorize';
import { rateLimiter } from '../../middleware/rateLimiter';
import { submitAttendanceRequestSchema, rejectRequestSchema } from './attendance-request.schema';

export const attendanceRequestRouter = Router({ mergeParams: true });

attendanceRequestRouter.use(authenticate);

// Rate limiter for request submissions
const requestLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many attendance scan requests. Please wait a moment.',
});

// Employee submits attendance request from QR scan
attendanceRequestRouter.post(
  '/attendance/requests',
  requestLimiter,
  validateRequest({ body: submitAttendanceRequestSchema }),
  attendanceRequestController.submitRequest
);

// Employee gets their own request for today
attendanceRequestRouter.get(
  '/:workplaceId/attendance/requests/my-today',
  requireWorkplaceMember(),
  attendanceRequestController.getMyTodayRequest
);

// Employer lists pending requests
attendanceRequestRouter.get(
  '/:workplaceId/attendance/requests',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  attendanceRequestController.getWorkplaceRequests
);

// Employer approves request
attendanceRequestRouter.post(
  '/:workplaceId/attendance/requests/:requestId/approve',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  attendanceRequestController.approveRequest
);

// Employer rejects request
attendanceRequestRouter.post(
  '/:workplaceId/attendance/requests/:requestId/reject',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: rejectRequestSchema }),
  attendanceRequestController.rejectRequest
);
