import { z } from 'zod';

export const manualAttendanceSchema = z.object({
  employeeMemberId: z.string().min(1, 'Employee member ID is required'),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE']),
  correctionReason: z.string().min(3, 'A valid reason is required for manual attendance').max(200),
});

export const attendanceHistoryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format').optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
