import { z } from 'zod';

const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  'Choose a valid calendar date',
);


export const manualAttendanceSchema = z.object({
  employeeMemberId: z.string().min(1, 'Employee member ID is required'),
  attendanceDate: validDate,
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE']),
  correctionReason: z.string().min(3, 'A valid reason is required for manual attendance').max(200),
});

export const rosterQuerySchema = z.object({ date: validDate.optional() });
export const attendanceHistoryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format').optional(),
  startDate: validDate.optional(),
  endDate: validDate.optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE']).optional(),
  employeeMemberId: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
}).superRefine((query, ctx) => {
  if (!!query.startDate !== !!query.endDate) ctx.addIssue({ code: 'custom', message: 'Both range dates are required' });
  if (query.month && query.startDate) ctx.addIssue({ code: 'custom', message: 'Choose a month or a date range' });
  if (query.startDate && query.endDate && query.startDate > query.endDate) ctx.addIssue({ code: 'custom', message: 'Start date must precede end date' });
});
