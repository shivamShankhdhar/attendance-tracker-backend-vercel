import { z } from 'zod';

export const createEmployeeSchema = z
  .object({
    name: z.string().max(60).optional(),
    email: z.string().email('Valid email address required').optional(),
    employeeCode: z.string().min(2).max(12).optional(),
    pin: z.string().min(4, 'PIN must be at least 4 digits').max(6, 'PIN maximum 6 digits').optional(),
    teamId: z.string().optional(),
    teamCode: z.string().optional(),
  })
  .refine((data) => Boolean(data.name || data.email), {
    message: 'Either employee name or email must be provided',
  });

export const updateEmployeeSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  employeeCode: z.string().min(2).max(12).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  teamId: z.string().optional(),
  teamCode: z.string().optional(),
});

export const resetPinSchema = z.object({
  newPin: z.string().min(4, 'PIN must be at least 4 digits').max(6, 'PIN maximum 6 digits'),
});

export const claimInvitationSchema = z.object({
  invitationToken: z.string().optional(),
  workplaceId: z.string().optional(),
});
