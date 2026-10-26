import { z } from 'zod';

export const submitAttendanceRequestSchema = z
  .object({
    qrToken: z.string().optional(),
    workplaceId: z.string().optional(),
    deviceSsid: z.string().optional(),
    source: z.enum(['QR', 'DIRECT', 'MANUAL', 'GEOFENCE']).optional(),
    requestType: z.enum(['CHECK_IN', 'CHECK_OUT', 'MISSED_PUNCH', 'MISSED_CHECK_OUT', 'CASUAL_LEAVE', 'SICK_LEAVE', 'PAID_LEAVE']).optional(),
    attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid date').optional(),
    proposedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
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
