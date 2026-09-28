import { z } from 'zod';
import { isValidTimezone } from '../../utils/date';

export const createWorkplaceSchema = z.object({
  name: z.string().min(2, 'Workplace name must be at least 2 characters').max(60),
  timezone: z
    .string()
    .default('Asia/Kolkata')
    .refine((tz) => isValidTimezone(tz), {
      message: 'Invalid IANA timezone (e.g. Asia/Kolkata, America/New_York)',
    }),
  address: z.string().max(200).optional(),
  wifiSsid: z.string().max(60).optional(),
  attendanceSettings: z
    .object({
      requireWifi: z.boolean().default(false),
      autoCloseHour: z.number().min(0).max(23).default(23),
    })
    .optional(),
});

export const updateWorkplaceSchema = createWorkplaceSchema.partial();
