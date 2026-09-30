import { Router } from 'express';
import { attendanceController } from './attendance.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { requireWorkplaceMember, requireWorkplaceRole } from '../../middleware/authorize';
import { manualAttendanceSchema, attendanceHistoryQuerySchema, rosterQuerySchema } from './attendance.schema';

export const attendanceRouter = Router({ mergeParams: true });

attendanceRouter.use(authenticate);

// Get today's roster and counts (EMPLOYER or EMPLOYEE)
attendanceRouter.get(
  '/:workplaceId/attendance/today',
  requireWorkplaceMember(),
  validateRequest({ query: rosterQuerySchema }),
  attendanceController.getTodayRoster
);

// Employee's own attendance history
attendanceRouter.get(
  '/:workplaceId/attendance/history',
  requireWorkplaceMember(),
  validateRequest({ query: attendanceHistoryQuerySchema }),
  attendanceController.getMyHistory
);

// Employer attendance reports
attendanceRouter.get(
  '/:workplaceId/attendance/reports',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ query: attendanceHistoryQuerySchema }),
  attendanceController.getReports
);

// Employer marks manual attendance / correction
attendanceRouter.post(
  '/:workplaceId/attendance/manual',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: manualAttendanceSchema }),
  attendanceController.markManualAttendance
);

// Employer views a specific employee's attendance history
attendanceRouter.get(
  '/:workplaceId/attendance/employees/:memberId/history',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ query: attendanceHistoryQuerySchema }),
  attendanceController.getEmployeeHistory
);

