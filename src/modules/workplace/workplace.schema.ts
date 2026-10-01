import { z } from 'zod';
import { isValidTimezone } from '../../utils/date';

export const createWorkplaceSchema = z.object({
  name: z.string().min(2, 'Workplace name must be at least 2 characters').max(60),
  timezone: z
    .string()
    .optional()
    .default('Asia/Kolkata')
    .refine((tz) => !tz || isValidTimezone(tz), {
      message: 'Invalid IANA timezone (e.g. Asia/Kolkata, America/New_York)',
    }),
  address: z.string().max(200).optional(),
  description: z.string().max(300).optional(),
  wifiSsid: z.string().max(60).optional(),
  attendanceSettings: z
    .object({
      requireWifi: z.boolean().default(false),
      autoCloseHour: z.number().min(0).max(23).default(23),
      allowEmployeeViewHistory: z.boolean().default(true).optional(),
    })
    .optional(),
});

export const updateWorkplaceSchema = createWorkplaceSchema.partial();

export const joinPreviewSchema = z.object({
  token: z.string().min(1, 'Invite token is required').max(4096),
});

export const submitJoinRequestSchema = z.object({
  token: z.string().min(1, 'Invite token is required').max(4096),
  note: z.string().max(200, 'Note must not exceed 200 characters').optional(),
});

export const approveJoinRequestSchema = z.object({
  employeeCode: z.string().max(30).optional(),
});

export const rejectJoinRequestSchema = z.object({
  reason: z.string().max(300).optional(),
});
