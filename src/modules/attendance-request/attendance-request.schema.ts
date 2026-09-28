import { z } from 'zod';

export const submitAttendanceRequestSchema = z.object({
  qrToken: z.string().min(1, 'QR token is required'),
  deviceSsid: z.string().optional(),
});

export const rejectRequestSchema = z.object({
  reason: z.string().max(120).optional(),
});
