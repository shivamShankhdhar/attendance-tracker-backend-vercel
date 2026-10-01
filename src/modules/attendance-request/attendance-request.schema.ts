import { z } from 'zod';

export const submitAttendanceRequestSchema = z
  .object({
    qrToken: z.string().optional(),
    workplaceId: z.string().optional(),
    deviceSsid: z.string().optional(),
    source: z.enum(['QR', 'WIFI', 'DIRECT', 'MANUAL']).optional(),
    wifiMode: z.boolean().optional(),
    note: z.string().max(200).optional(),
  })
  .refine((data) => Boolean(data.qrToken || data.workplaceId), {
    message: 'Either qrToken or workplaceId must be provided',
  });

export const rejectRequestSchema = z.object({
  reason: z.string().max(120).optional(),
});
