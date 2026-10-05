import { z } from 'zod';

export const submitAttendanceRequestSchema = z
  .object({
    qrToken: z.string().optional(),
    workplaceId: z.string().optional(),
    deviceSsid: z.string().optional(),
    source: z.enum(['QR', 'DIRECT', 'MANUAL', 'GEOFENCE']).optional(),
    requestType: z.enum(['CHECK_IN', 'CHECK_OUT']).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracy: z.number().optional(),
    note: z.string().max(200).optional(),
  })
  .refine((data) => Boolean(data.qrToken || data.workplaceId), {
    message: 'Either qrToken or workplaceId must be provided',
  });

export const rejectRequestSchema = z.object({
  reason: z.string().max(120).optional(),
});
